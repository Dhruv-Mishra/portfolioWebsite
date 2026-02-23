"use client";

import { useSyncExternalStore } from 'react';
import { LAYOUT_TOKENS } from '@/lib/designTokens';

const MOBILE_QUERY = `(max-width: ${LAYOUT_TOKENS.mobileBreakpoint - 1}px)`;

// Cache the MediaQueryList at module scope — avoids creating a new MQL object
// on every getSnapshot/subscribe call (window.matchMedia returns a new object each time).
let _mql: MediaQueryList | null = null;
function getMql(): MediaQueryList {
    return (_mql ??= window.matchMedia(MOBILE_QUERY));
}

/** Module-scoped subscribe — uses cached MQL, avoids re-subscription waste. */
function subscribe(callback: () => void): () => void {
    const mql = getMql();
    mql.addEventListener('change', callback);
    return () => mql.removeEventListener('change', callback);
}

/** Module-scoped snapshot — uses cached MQL, avoids redundant matchMedia calls. */
function getSnapshot(): boolean {
    return getMql().matches;
}

/** Server snapshot — always false until hydrated. */
function getServerSnapshot(): boolean {
    return false;
}

/**
 * Custom hook to detect if the current viewport is mobile.
 * Uses window.matchMedia for performance and is hydration-safe
 * by defaulting to false until mounted.
 */
export function useIsMobile(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
