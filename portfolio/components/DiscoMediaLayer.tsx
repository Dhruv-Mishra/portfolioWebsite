"use client";

/**
 * DiscoMediaLayer — the HEAVY disco mode media tree. Owns:
 *   - The sparkle canvas mount (DiscoSparkleCanvas)
 *   - The moving spotlights mount (DiscoSpotlights)
 *   - The disco music lifecycle (soundManager.startLoop / stopLoop +
 *     procedural-external fallback via discoAudio)
 *   - The floating mute button (DiscoMuteButton)
 *
 * Split from `DiscoFlagController` so the JS for these modules ships ONLY to
 * users who actually activate disco. Lazy-loaded by DiscoFlagController via
 * dynamic import() the first time `discoActive` flips true.
 *
 * Music lifecycle:
 *   - Tries `soundManager.startLoop('disco-loop')` first. If the MP3 buffer
 *     has been decoded, it plays the real music.
 *   - If the buffer isn't ready yet (very first visit, fetch still in flight),
 *     the startLoop path automatically falls back to `procedural-external`
 *     mode by invoking a registered factory — which boots the existing
 *     `discoAudio.startDiscoAudio` synth. Music still plays, just synthesized.
 *   - On disco deactivation: stopLoop() cleanly tears down whichever path
 *     is running.
 *   - Mute toggle flows through the sound manager's master gain for buffer
 *     mode; for procedural-external mode the sound manager proxies setMuted
 *     to the external handle.
 *
 * Lifecycle contract: this component MUST only be rendered while
 * `discoActive === true`. The parent (DiscoFlagController) is responsible for
 * the guard — we don't re-check here, so mounting this unconditionally would
 * start audio without a user gesture (and break Web Audio autoplay rules).
 *
 * Re-render hygiene:
 *   - Wrapped in React.memo; parent re-renders do not retrigger the audio
 *     effect or remount the sparkle canvas.
 *   - The sparkle canvas + spotlights + mute button live inside `DiscoVisuals`,
 *     a separate memoized component that consumes NO store state — so mute
 *     toggles (which re-render the audio bridge below) do NOT cascade into
 *     a visuals re-render. Sparkles remain a single long-lived mount for the
 *     whole disco session, which is what keeps rAF allocations bounded.
 *   - Mute piping lives in `DiscoAudioBridge`, a zero-DOM component that
 *     subscribes to `discoMuted` and calls `setMuted()` on the live audio
 *     handle. Re-renders of this bridge are cheap (no JSX returned).
 */
import { memo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useDiscoMuted } from '@/hooks/useStickers';
import { startDiscoAudio } from '@/lib/discoAudio';
import { soundManager, registerExternalLoopFactory } from '@/lib/soundManager';

// Nested modules — all lazy, none in the eager bundle.
const DiscoSparkleCanvas = dynamic(() => import('./DiscoSparkleCanvas'), { ssr: false, loading: () => null });
const DiscoSpotlights = dynamic(() => import('./DiscoSpotlights'), { ssr: false, loading: () => null });
const DiscoMuteButton = dynamic(() => import('./DiscoMuteButton'), { ssr: false, loading: () => null });

/**
 * DiscoVisuals — the long-lived visual tree. Zero store subscriptions, so
 * nothing in the sticker store re-renders this component. The sparkle canvas
 * and spotlight DOM tree mount ONCE and live for the entire disco session.
 */
const DiscoVisuals = memo(function DiscoVisuals(): React.ReactElement {
  return (
    <>
      <DiscoSparkleCanvas />
      <DiscoSpotlights />
      <DiscoMuteButton />
    </>
  );
});

// Register the procedural-external factory on module load. This is safe at
// module-top because registration is just Map.set; it doesn't create an
// AudioContext or start audio. The factory is only INVOKED from inside a
// user-gesture call tree (startLoop).
//
// The factory is the bridge between the sound manager's looping API and
// the existing discoAudio engine. When the MP3 buffer isn't ready, the
// manager calls this to get an object that can stop() / setMuted().
registerExternalLoopFactory('disco-loop', () => {
  const handle = startDiscoAudio({ muted: false });
  if (!handle) return null;
  return {
    stop: (): void => handle.stop(),
    setMuted: (m: boolean): void => handle.setMuted(m),
  };
});

/**
 * DiscoAudioBridge — a zero-DOM component that owns the disco music
 * lifecycle. Re-renders on `discoMuted` flips (the only state it reads), but
 * the re-render is cheap because there's no JSX + no child tree below.
 *
 * Flow on mount (disco activation):
 *   1. Try soundManager.startLoop('disco-loop'). If the MP3 buffer has been
 *      fetched + decoded already, the loop starts on a buffer source.
 *   2. If the buffer isn't ready, startLoop falls through to the
 *      registerExternalLoopFactory callback above, which spins up the
 *      procedural discoAudio engine. Either way, music plays.
 *   3. If buffer becomes available later (warmup finished mid-session), we
 *      subscribe via onBufferReady — at which point we stop the procedural
 *      loop and restart as a buffer loop. The transition has a ~300ms fade
 *      crossover built into stopLoop/startLoop.
 *   4. Push the current muted state into the loop on mount + every flip.
 *
 * Teardown (disco deactivation):
 *   - stopLoop handles both modes (buffer fade-out + disconnect, or call
 *     discoAudio's stop() for procedural-external).
 */
const DiscoAudioBridge = memo(function DiscoAudioBridge(): null {
  const discoMuted = useDiscoMuted();

  // Start the music on mount. We track whether we're in procedural-external
  // or buffer mode to know whether to upgrade to buffer when it lands.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    let unsubscribeReady: (() => void) | null = null;

    // Kick off the loop immediately. startLoop() synchronously decides the
    // mode based on buffer availability.
    const started = soundManager.startLoop('disco-loop');

    // Apply the current disco-specific mute preference to the loop only
    // (NOT the global sitewide mute — that's a separate preference).
    if (started) {
      soundManager.setLoopMuted('disco-loop', discoMuted);
    }

    // If we're currently on the procedural fallback (buffer wasn't ready),
    // subscribe to buffer-ready so we can upgrade.
    const isBufferMode = soundManager.hasBuffer('disco-loop');
    if (started && !isBufferMode) {
      // Hot-swap listener — fires when the MP3 decode finishes.
      unsubscribeReady = soundManager.onBufferReady('disco-loop', () => {
        if (cancelled) return;
        // Are we still playing the procedural fallback? If so, swap in the
        // buffer. If the loop has already been stopped (disco exited), do
        // nothing — the next disco activation will just use buffer directly.
        if (!soundManager.isLoopPlaying('disco-loop')) return;
        soundManager.stopLoop('disco-loop');
        // Brief micro-delay so the stop's fade starts before the new loop's
        // fade-in overlaps (~300ms cross-fade total).
        window.setTimeout(() => {
          if (cancelled) return;
          soundManager.startLoop('disco-loop');
          soundManager.setLoopMuted('disco-loop', discoMuted);
        }, 150);
      });
    }

    return () => {
      cancelled = true;
      if (unsubscribeReady) unsubscribeReady();
      try {
        soundManager.stopLoop('disco-loop');
      } catch {
        /* best-effort */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pipe disco mute flips into the loop. Buffer-backed loops get a per-loop
  // gain ramp; procedural-external loops proxy to the external setMuted.
  // This does NOT touch the sitewide `soundsMuted` preference or the master
  // gain — those stay independent.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    soundManager.setLoopMuted('disco-loop', discoMuted);
  }, [discoMuted]);

  return null;
});

function DiscoMediaLayerImpl(): React.ReactElement {
  return (
    <>
      <DiscoVisuals />
      <DiscoAudioBridge />
    </>
  );
}

export default memo(DiscoMediaLayerImpl);
