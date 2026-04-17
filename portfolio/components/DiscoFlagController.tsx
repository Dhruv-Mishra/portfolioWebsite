"use client";

/**
 * DiscoFlagController — the TINY, eagerly-mounted client component that owns
 * only the `data-disco` attribute on <html>. Split out from the heavy
 * DiscoModeController so users who never unlock disco pay near-zero JS cost.
 *
 * What this component does (ALL it does):
 *   1. Subscribes to `discoActive` from the sticker store (single boolean).
 *   2. Writes / clears `data-disco="on"` on <html>.
 *   3. When `discoActive` flips to true, dynamically imports and mounts the
 *      heavy `DiscoMediaLayer` (sparkle canvas + spotlights + mute button +
 *      audio engine). The import() call itself is gated on `discoActive` so
 *      users who never turn on disco never fetch the bundle.
 *   4. Hosts the matrix-rain overlay listener (a small piece of JS that lives
 *      in the heavy layer but is needed even without full disco activation —
 *      `sudo matrix` is a standalone easter egg). To keep the eager bundle
 *      tiny we delay loading the matrix module until the first sudo:matrix
 *      event fires.
 *
 * Bundle-split contract:
 *   - `./DiscoFlagController.tsx` is the ONLY disco-related module in the
 *     initial bundle of any page that imports EagerEnhancements.
 *   - `./DiscoMediaLayer.tsx` (and its sub-deps: DiscoSparkleCanvas,
 *     DiscoSpotlights, DiscoMuteButton, @/lib/discoAudio) MUST NOT be in the
 *     initial bundle. They're fetched on demand when disco activates.
 *   - The matrix overlay module (`./DiscoMatrixOverlay`) is fetched only when
 *     the first `sudo:matrix` event fires.
 *
 * Re-render hygiene:
 *   - This component re-renders on `discoActive` flips only. The narrow hook
 *     `useDiscoActive` is backed by useSyncExternalStore with a boolean
 *     selector — mute toggles, sticker unlocks, and other store mutations do
 *     not trigger a re-render here.
 *   - The mounted `DiscoMediaLayer` is memoized at its module root so its
 *     React tree is preserved across parent re-renders.
 */
import { useEffect, useState } from 'react';
import { useDiscoActive } from '@/hooks/useStickers';

type MediaLayerModule = typeof import('./DiscoMediaLayer');

export default function DiscoFlagController(): React.ReactElement | null {
  const discoActive = useDiscoActive();
  const [MediaLayer, setMediaLayer] = useState<MediaLayerModule['default'] | null>(null);

  // 1) Sync store flag → <html data-disco>. This is the only always-on work.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (discoActive) {
      root.dataset.disco = 'on';
    } else {
      delete root.dataset.disco;
    }
  }, [discoActive]);

  // 2) Gate the heavy import — only fetch the chunk once `discoActive` is true
  //    for the first time. Stays resolved for the rest of the session so a
  //    subsequent off/on flip doesn't refetch.
  useEffect(() => {
    if (!discoActive) return;
    if (MediaLayer) return;
    let cancelled = false;
    void import('./DiscoMediaLayer').then((mod) => {
      if (!cancelled) setMediaLayer(() => mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, [discoActive, MediaLayer]);

  // 3) Matrix overlay — completely independent of disco. Lives in its own
  //    tiny chunk and is only loaded the first time the user types
  //    `sudo matrix`. We listen for the CustomEvent here and hand it off.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (): void => {
      void import('./DiscoMatrixOverlay').then((mod) => {
        mod.spawnMatrixOverlay();
      });
    };
    window.addEventListener('sudo:matrix', handler);
    return () => window.removeEventListener('sudo:matrix', handler);
  }, []);

  // Only mount the media tree when BOTH: the flag is on AND the chunk landed.
  if (!discoActive || !MediaLayer) return null;
  return <MediaLayer />;
}
