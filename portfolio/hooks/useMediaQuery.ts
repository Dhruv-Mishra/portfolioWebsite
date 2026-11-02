"use client";

import { useCallback, useSyncExternalStore } from 'react';
import { LAYOUT_TOKENS } from '@/lib/designTokens';

export const MOBILE_QUERY = `(max-width: ${LAYOUT_TOKENS.mobileBreakpoint - 1}px)`;
/** Hover-capable fine pointer: excludes phones, tablets, and touch-first hybrids. */
export const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

const lists = new Map<string, MediaQueryList>();

function mediaQueryList(query: string): MediaQueryList {
  let list = lists.get(query);
  if (!list) {
    list = window.matchMedia(query);
    lists.set(query, list);
  }
  return list;
}

/** False on the server and until hydration, so query-gated UI never mismatches SSR. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const list = mediaQueryList(query);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return useSyncExternalStore(subscribe, () => mediaQueryList(query).matches, () => false);
}

export const useIsMobile = (): boolean => useMediaQuery(MOBILE_QUERY);
export const useDesktopOnly = (): boolean => useMediaQuery(FINE_POINTER_QUERY);
