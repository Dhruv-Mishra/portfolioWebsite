"use client";

/**
 * DiscoMediaLayer — the HEAVY disco mode media tree. Owns:
 *   - The sparkle canvas mount (DiscoSparkleCanvas)
 *   - The moving spotlights mount (DiscoSpotlights)
 *   - The audio engine lifecycle (startDiscoAudio / handle.stop)
 *   - The floating mute button (DiscoMuteButton)
 *
 * Split from `DiscoFlagController` so the JS for these modules ships ONLY to
 * users who actually activate disco. Lazy-loaded by DiscoFlagController via
 * dynamic import() the first time `discoActive` flips true.
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
import { startDiscoAudio, type DiscoAudioHandle } from '@/lib/discoAudio';

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

/**
 * DiscoAudioBridge — a zero-DOM component that owns the audio engine
 * lifecycle. Re-renders on `discoMuted` flips (the only state it reads), but
 * the re-render is cheap because there's no JSX + no child tree below.
 */
const DiscoAudioBridge = memo(function DiscoAudioBridge(): null {
  const discoMuted = useDiscoMuted();

  // Audio lifecycle — start on mount (we only mount when disco is on and a
  // user gesture drove the activation, so Web Audio autoplay rules pass).
  // Tear down on unmount (disco exit).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let handle: DiscoAudioHandle | null = null;
    try {
      handle = startDiscoAudio({ muted: discoMuted });
    } catch {
      handle = null;
    }
    return () => {
      try {
        handle?.stop();
      } catch {
        /* best-effort */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pipe mute flips into the live audio handle WITHOUT tearing down the
  // graph. startDiscoAudio is idempotent and returns the existing handle.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handle = startDiscoAudio({ muted: discoMuted });
    handle?.setMuted(discoMuted);
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
