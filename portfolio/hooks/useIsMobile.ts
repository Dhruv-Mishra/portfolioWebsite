"use client";

import { useState, useEffect } from 'react';
import { MOBILE_BREAKPOINT } from '@/lib/constants';

/**
 * Custom hook to detect if the current viewport is mobile.
 * Uses window.matchMedia for performance and is'hydration-safe'
 * by defaulting to false until mounted.
 */
export function useIsMobile() {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        // Define the media query
        const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

        // Initial check
        setIsMobile(mql.matches);

        // Listener for changes
        const onChange = (e: MediaQueryListEvent) => {
            setIsMobile(e.matches);
        };

        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, []);

    return isMobile;
}
