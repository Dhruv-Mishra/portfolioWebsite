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
 *   4. Subscribes to `matrixActive` — when true, dynamically imports the
 *      MATRIX overlay (`DiscoMatrixOverlay`). Matrix is PERSISTED across
 *      reloads, so the overlay re-spawns on every page load while the
 *      flag is true. The only exit path is the in-overlay WAKE UP button.
 *
 * Bundle-split contract:
 *   - `./DiscoFlagController.tsx` is the ONLY disco-related module in the
 *     initial bundle of any page that imports EagerEnhancements.
 *   - `./DiscoMediaLayer.tsx` (and its sub-deps: DiscoSparkleCanvas,
 *     DiscoSpotlights, DiscoMuteButton, @/lib/discoAudio) MUST NOT be in the
 *     initial bundle. They're fetched on demand when disco activates.
 *   - `./DiscoMatrixOverlay.tsx` is fetched only when `matrixActive` first
 *     flips true (either via sudo or on a reload with the flag persisted).
 *
 * Re-render hygiene:
 *   - This component re-renders on `discoActive` / `matrixActive` flips.
 *     The narrow `useDiscoActive` / `useMatrixActive` hooks are backed by
 *     `useSyncExternalStore` with boolean selectors — mute toggles, sticker
 *     unlocks, and other store mutations do not trigger a re-render here.
 *   - The mounted `DiscoMediaLayer` and `DiscoMatrixOverlay` are both
 *     memoized at their module root so their React trees are preserved
 *     across parent re-renders.
 */
import { useEffect, useState } from 'react';
import { useDiscoActive, useMatrixActive } from '@/hooks/useStickers';

type MediaLayerModule = typeof import('./DiscoMediaLayer');
type MatrixOverlayModule = typeof import('./DiscoMatrixOverlay');

export default function DiscoFlagController(): React.ReactElement | null {
  const discoActive = useDiscoActive();
  const matrixActive = useMatrixActive();
  const [MediaLayer, setMediaLayer] = useState<MediaLayerModule['default'] | null>(null);
  const [MatrixOverlay, setMatrixOverlay] = useState<MatrixOverlayModule['default'] | null>(null);

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

  // 2) Gate the heavy disco import — only fetch the chunk once `discoActive`
  //    is true for the first time. Stays resolved for the rest of the session
  //    so a subsequent off/on flip doesn't refetch.
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

  // 3) Matrix overlay — PERSISTED across reloads. When matrixActive is true
  //    on mount OR flips true later, dynamically import the overlay chunk
  //    and mount it. The overlay owns its own lifecycle; dismissal happens
  //    via `setMatrixActiveImperative(false)` from the in-overlay WAKE UP
  //    button, which flips this flag back to false and unmounts the tree.
  useEffect(() => {
    if (!matrixActive) return;
    if (MatrixOverlay) return;
    let cancelled = false;
    void import('./DiscoMatrixOverlay').then((mod) => {
      if (!cancelled) setMatrixOverlay(() => mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, [matrixActive, MatrixOverlay]);

  // 4) Sync store flag → <html data-matrix>. Consumers (e.g. sidebar chrome
  //    that wants to dim during matrix) can subscribe to this attribute.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (matrixActive) {
      root.dataset.matrix = 'on';
    } else {
      delete root.dataset.matrix;
    }
  }, [matrixActive]);

  // Render: disco media tree AND/OR matrix overlay, each guarded by both
  // (a) the store flag AND (b) the lazy chunk having landed.
  return (
    <>
      {discoActive && MediaLayer ? <MediaLayer /> : null}
      {matrixActive && MatrixOverlay ? <MatrixOverlay /> : null}
    </>
  );
}
