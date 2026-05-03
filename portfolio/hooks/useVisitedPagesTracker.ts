"use client";

/**
 * useVisitedPagesTracker — records the current pathname whenever it
 * changes and emits sticker events when the tour condition is met.
 *
 * Triggers:
 *   - 'page-turner': visited all 5 core routes (/, /projects, /about, /resume, /chat).
 *
 * Mounts via <VisitedPagesTrackerMount /> in EagerEnhancements.
 */
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { addVisitedRouteImperative } from '@/hooks/useStickers';
import { stickerBus } from '@/lib/stickerBus';

const CORE_ROUTES: readonly string[] = ['/', '/projects', '/about', '/resume', '/chat'];

function hasVisitedAllCore(visited: readonly string[]): boolean {
  if (visited.length < CORE_ROUTES.length) return false;
  const set = new Set(visited);
  for (const route of CORE_ROUTES) {
    if (!set.has(route)) return false;
  }
  return true;
}

export function useVisitedPagesTracker(): void {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    // Persist the route visit
    addVisitedRouteImperative(pathname);

    // Read the newly-updated visited list from localStorage directly to avoid
    // stale-closure surprises with useSyncExternalStore during rapid nav.
    let visited: string[] = [];
    try {
      const raw = window.localStorage.getItem('dhruv-stickers');
      if (raw) {
        const parsed = JSON.parse(raw) as { visitedRoutes?: unknown };
        if (Array.isArray(parsed.visitedRoutes)) {
          visited = parsed.visitedRoutes.filter((r): r is string => typeof r === 'string');
        }
      }
    } catch {
      /* ignore storage read errors */
    }

    if (hasVisitedAllCore(visited)) {
      stickerBus.emit('page-turner');
    }
  }, [pathname]);
}
