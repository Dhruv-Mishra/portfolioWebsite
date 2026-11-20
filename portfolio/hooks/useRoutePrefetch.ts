"use client";

import { useState } from 'react';
import { canWarmNoncriticalAssets } from '@/lib/networkHints';

/**
 * Prefetch policy for always-visible links: the current route is never prefetched, and on Save-Data or slow
 * connections a route is prefetched on intent (hover, touch, focus) rather than as soon as the link is visible.
 * Spread the result onto a next/link `Link`.
 */
export function useRoutePrefetch(active = false) {
  const [intent, setIntent] = useState(false);
  const showIntent = () => setIntent(true);
  return {
    prefetch: active ? false : intent || canWarmNoncriticalAssets() ? null : false,
    onMouseEnter: showIntent,
    onTouchStart: showIntent,
    onFocus: showIntent,
  };
}
