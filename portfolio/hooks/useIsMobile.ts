"use client";

import { useSyncExternalStore } from 'react';
import { MOBILE_BREAKPOINT } from '@/lib/constants';

/**
 * Custom hook to detect if the current viewport is mobile.
 * Uses window.matchMedia for performance and is'hydration-safe'
 * by defaulting to false until mounted.
 */
export function useIsMobile() {
    return useSyncExternalStore(
        (callback: () => void) => {
            const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
            const handler = () => callback();
            mql.addEventListener('change', handler);
            return () => mql.removeEventListener('change', handler);
        },
        () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches,
        () => false
    );
}
