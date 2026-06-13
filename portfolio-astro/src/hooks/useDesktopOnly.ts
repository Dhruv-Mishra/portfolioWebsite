"use client";

import { useEffect, useState } from 'react';

/**
 * Media-query probe for "true" desktop — a device with hover capability and a
 * fine pointer. This filters out phones, tablets, and touch-first hybrid
 * devices where hover+fine-pointer is unreliable. Consumers use this to gate
 * desktop-only chrome (command palette, shortcuts overlay, keyboard hints) so
 * their JS never ships to mobile.
 *
 * SSR / pre-hydration default is `false` — we prefer not to render
 * desktop-only modules during SSR and then tear them down on the client.
 */
const QUERY = '(hover: hover) and (pointer: fine)';

export function useDesktopOnly(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(QUERY);
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}
