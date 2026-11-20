/**
 * assetPrefetch — scheduler for non-critical asset warmup.
 *
 * Design:
 *   - Runs client-side only; every exported function is a no-op on the
 *     server.
 *   - Respects user and network preferences — skips prefetch entirely on
 *     Data Saver (`connection.saveData === true`) and on slow effective
 *     connections (`2g`, `slow-2g`, `3g`).
 *   - All prefetches are scheduled via `requestIdleCallback` (with a
 *     `setTimeout` fallback using the real deadline for Safari / older
 *     mobile) so they never compete with the main-thread work that happens
 *     around first paint.
 *   - Completely idempotent — each prefetch has a latch so repeat calls are
 *     a no-op. Safe to call multiple times.
 *
 * Prefetch catalog (all superuser-gated unless otherwise noted):
 *   - Disco media chunk (`components/DiscoMediaLayer.tsx` + sub-deps) —
 *     ONLY if superuser has been earned.
 *   - Matrix overlay chunk (`components/DiscoMatrixOverlay.tsx`) — ONLY if
 *     superuser.
 *   - Superuser-gated sounds (disco-start, disco-loop, matrix) — via
 *     `soundManager.warmupSuperuserSounds()`, ONLY if superuser.
 *
 * Integration:
 *   - `components/AssetPrefetchController.tsx` owns the React mount. It
 *     subscribes to the narrow `useSuperuserUnlocked` selector and calls
 *     `scheduleSuperuserPrefetch` exactly once per session after the
 *     flag flips true.
 */

import { canWarmNoncriticalAssets } from '@/lib/networkHints';

/** Was prefetch already scheduled in this session? Guards repeat calls. */
let scheduled = false;

/**
 * Schedule a callback during the next idle window. Falls back to a short
 * `setTimeout` on browsers without `requestIdleCallback`. Using this over a
 * raw `setTimeout` keeps prefetch off the main thread when it's busy.
 */
function scheduleIdle(cb: () => void, timeoutMs: number): void {
  if (typeof window === 'undefined') return;
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(cb, { timeout: timeoutMs });
  } else {
    window.setTimeout(cb, timeoutMs);
  }
}

/**
 * Kick off superuser-gated prefetches — the disco media chunk, the matrix
 * overlay chunk, and the superuser-gated sound samples. Every action is
 * idempotent: if a chunk was already imported (because the user already
 * activated disco or matrix) this is a no-op.
 *
 * Contract:
 *   - Runs during an idle window. Never blocks the main thread.
 *   - Silent on failure — the disco / matrix flows have their own runtime
 *     fetch with retry, so a lost prefetch just means a ~100ms stall at
 *     activation time.
 *   - Respects `canWarmNoncriticalAssets()` — skipped entirely on Data Saver / slow
 *     connections.
 */
export function scheduleSuperuserPrefetch(): void {
  if (typeof window === 'undefined') return;
  if (scheduled) return;
  if (!canWarmNoncriticalAssets()) return;
  scheduled = true;

  scheduleIdle(() => {
    // Disco media chunk — harmless if it was already imported by
    // `disco` pre-warm. Dynamic import uses Next.js chunk splitting.
    void import('@/components/DiscoMediaLayer').catch(() => {
      /* best-effort — runtime import retries on activation */
    });
    // Matrix overlay chunk — fetched here so the very first `sudo matrix`
    // paints without a chunk-fetch stall.
    void import('@/components/DiscoMatrixOverlay').catch(() => {
      /* best-effort */
    });
    // Superuser sound samples (disco-start, disco-loop, matrix). Dedup'd
    // by the sound manager — if the AudioContext isn't up yet the wave
    // is latched and fires on the next gesture.
    void import('@/lib/soundManager')
      .then(({ soundManager }) => soundManager.warmupSuperuserSounds())
      .catch(() => {
        /* best-effort */
      });
  }, 1500);
}

/** @internal — reset the scheduled latch for tests. */
export function __resetAssetPrefetchForTest(): void {
  scheduled = false;
}

/** @internal — inspect current prefetch state for tests. */
export function __getPrefetchDebug(): {
  readonly scheduled: boolean;
  readonly shouldPrefetch: boolean;
} {
  return Object.freeze({
    scheduled,
    shouldPrefetch: canWarmNoncriticalAssets(),
  });
}
