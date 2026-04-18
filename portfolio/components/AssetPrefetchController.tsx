"use client";

/**
 * AssetPrefetchController — headless mount that schedules non-critical asset
 * prefetches after the page is interactive.
 *
 * What it schedules:
 *   - Superuser-gated chunks (disco media, matrix overlay) via dynamic
 *     import() — ONLY when `hasSuperuser === true`.
 *   - Superuser-gated audio (`disco-start`, `disco-loop`, `matrix`) via
 *     `soundManager.warmupSuperuserSounds()`.
 *
 * What it does NOT schedule:
 *   - Critical UI sounds (page-flip, button-click, theme-*, chat-*,
 *     modal-*) — those are warmed by the sound manager itself on the first
 *     user gesture. See `soundManager.warmupCriticalWave`.
 *   - Anything for visitors who haven't earned superuser — their first
 *     bytes should all be core site assets.
 *
 * The scheduler in `lib/assetPrefetch.ts` handles Data Saver / slow-2g
 * gating and idle scheduling internally; this component just decides WHEN
 * to call it.
 *
 * Trigger timing:
 *   - We wait until both (a) the user has earned superuser AND (b) the
 *     first user gesture has likely happened. In practice we trigger after
 *     a short post-mount idle window — most superuser users land on the
 *     page in a returning state (their progress is persisted), so by the
 *     time the store hydrates + the controller mounts, the user has likely
 *     already clicked once.
 */
import { useEffect } from 'react';
import { useSuperuserUnlocked } from '@/hooks/useStickers';
import { scheduleSuperuserPrefetch } from '@/lib/assetPrefetch';

export default function AssetPrefetchController(): null {
  const hasSuperuser = useSuperuserUnlocked();

  useEffect(() => {
    if (!hasSuperuser) return;
    // scheduleSuperuserPrefetch is internally idempotent + latches on its
    // own, so even if React re-runs this effect the prefetch only fires
    // once per session.
    scheduleSuperuserPrefetch();
  }, [hasSuperuser]);

  return null;
}
