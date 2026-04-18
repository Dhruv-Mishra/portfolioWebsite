"use client";

/**
 * DiscoMediaLayer — the HEAVY disco mode media tree. Owns:
 *   - The sparkle canvas mount (DiscoSparkleCanvas)
 *   - The moving spotlights mount (DiscoSpotlights)
 *   - The disco music lifecycle (soundManager.startLoop / stopLoop +
 *     procedural-external fallback via discoAudio)
 *   - The disco beat-haptics pulse (DiscoHapticsBridge)
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
 *   - Mute is driven by the sitewide `soundsMuted` preference — there is no
 *     longer a separate disco-only mute. Buffer-backed loops are downstream
 *     of the shared master gain that `setMuted` ramps; procedural-external
 *     loops receive an explicit `setLoopMuted` call from the audio bridge.
 *
 * Lifecycle contract: this component MUST only be rendered while
 * `discoActive === true`. The parent (DiscoFlagController) is responsible for
 * the guard — we don't re-check here, so mounting this unconditionally would
 * start audio without a user gesture (and break Web Audio autoplay rules).
 *
 * Re-render hygiene:
 *   - Wrapped in React.memo; parent re-renders do not retrigger the audio
 *     effect or remount the sparkle canvas.
 *   - The sparkle canvas + spotlights live inside `DiscoVisuals`, a separate
 *     memoized component that consumes NO store state — so mute toggles
 *     (which re-render the audio bridge below) do NOT cascade into a visuals
 *     re-render. Sparkles remain a single long-lived mount for the whole
 *     disco session, which is what keeps rAF allocations bounded.
 *   - Mute piping lives in `DiscoAudioBridge`, a zero-DOM component that
 *     subscribes to `soundsMuted` and calls `setLoopMuted()` on the live
 *     audio handle. Re-renders of this bridge are cheap (no JSX returned).
 *   - Beat-haptics live in `DiscoHapticsBridge`, also zero-DOM. It uses the
 *     existing haptics hook to honor the runtime gate (touch/pen mode,
 *     tab-visible). No vibration on desktop-mouse sessions.
 */
import { memo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useSoundsMuted } from '@/hooks/useStickers';
import { useAppHaptics } from '@/lib/haptics';
import { startDiscoAudio } from '@/lib/discoAudio';
import { soundManager, registerExternalLoopFactory } from '@/lib/soundManager';
import { startDiscoHaptics, stopDiscoHaptics } from '@/lib/discoHaptics';

// Nested modules — all lazy, none in the eager bundle.
const DiscoSparkleCanvas = dynamic(() => import('./DiscoSparkleCanvas'), { ssr: false, loading: () => null });
const DiscoSpotlights = dynamic(() => import('./DiscoSpotlights'), { ssr: false, loading: () => null });

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
 * lifecycle. Re-renders on sitewide `soundsMuted` flips (the only state it
 * reads), but the re-render is cheap because there's no JSX + no child
 * tree below.
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
 *   4. Push the current sitewide-muted state into the loop on mount + every
 *      flip — this covers procedural-external mode (buffer mode rides the
 *      master gain that `setMuted` already ramps).
 *
 * Teardown (disco deactivation):
 *   - stopLoop handles both modes (buffer fade-out + disconnect, or call
 *     discoAudio's stop() for procedural-external).
 */
const DiscoAudioBridge = memo(function DiscoAudioBridge(): null {
  const soundsMuted = useSoundsMuted();

  // Start the music on mount. We track whether we're in procedural-external
  // or buffer mode to know whether to upgrade to buffer when it lands.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    let unsubscribeReady: (() => void) | null = null;

    // Kick off the loop immediately. startLoop() synchronously decides the
    // mode based on buffer availability.
    const started = soundManager.startLoop('disco-loop');

    // Apply the current sitewide mute preference to the loop so that if the
    // user had muted before activating disco, no audio leaks out on start.
    if (started) {
      soundManager.setLoopMuted('disco-loop', soundsMuted);
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
          soundManager.setLoopMuted('disco-loop', soundsMuted);
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

  // Pipe sitewide mute flips into the loop. Buffer-backed loops get a per-loop
  // gain ramp (in addition to the master gain ramp that setMuted already
  // performs); procedural-external loops proxy to the external setMuted.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    soundManager.setLoopMuted('disco-loop', soundsMuted);
  }, [soundsMuted]);

  return null;
});

/**
 * DiscoHapticsBridge — a zero-DOM component that pulses the device on every
 * disco beat (500ms interval, matching the 120 BPM disco loop tempo).
 *
 * Only mounted while disco is active. The interval is auto-paused when the
 * tab becomes hidden (handled inside the module) and cleaned up on unmount
 * when disco exits. The actual vibration call is gated by the existing
 * `canUseRuntimeHaptics()` helper inside `lib/haptics.ts`, so desktop-mouse
 * visitors never fire the vibration API.
 *
 * iOS caveat: web-haptics routes iOS Taptic Engine haptics through a hidden
 * switch-toggle trick. That trick only fires during user-gesture call
 * frames; a free-running setInterval cannot reliably replay it. Android and
 * desktop-with-touch devices receive full beat haptics; iOS currently sees
 * silent haptics during disco. Documented in `lib/discoHaptics.ts`.
 */
const DiscoHapticsBridge = memo(function DiscoHapticsBridge(): null {
  const { subtle } = useAppHaptics();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Hand a stable pulse function to the module; internal visibility gating
    // and interval lifecycle are owned there so disco-activation / tab-hide
    // / disco-deactivation all route through one place.
    startDiscoHaptics(subtle);
    return () => {
      stopDiscoHaptics();
    };
  }, [subtle]);

  return null;
});

function DiscoMediaLayerImpl(): React.ReactElement {
  return (
    <>
      <DiscoVisuals />
      <DiscoAudioBridge />
      <DiscoHapticsBridge />
    </>
  );
}

export default memo(DiscoMediaLayerImpl);
