"use client";

import { useKonamiCode } from '@/hooks/useKonamiCode';

/**
 * Headless wrapper — registers a global keydown listener for the Konami code.
 * Mounted once by EagerEnhancements so the listener is active from first load.
 */
export default function KonamiListenerMount(): null {
  useKonamiCode();
  return null;
}
