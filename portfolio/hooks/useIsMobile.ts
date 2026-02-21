"use client";

import { useSyncExternalStore } from 'react';
import { LAYOUT_TOKENS } from '@/lib/designTokens';

const MOBILE_QUERY = `(max-width: ${LAYOUT_TOKENS.mobileBreakpoint - 1}px)`;

/** Module-scoped subscribe — avoids re-subscription on every render. */
function subscribe(callback: () => void): () => void {
    const mql = window.matchMedia(MOBILE_QUERY);
    mql.addEventListener('change', callback);
    return () => mql.removeEventListener('change', callback);
}

/** Module-scoped snapshot — stable reference prevents unnecessary re-renders. */
function getSnapshot(): boolean {
    return window.matchMedia(MOBILE_QUERY).matches;
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
