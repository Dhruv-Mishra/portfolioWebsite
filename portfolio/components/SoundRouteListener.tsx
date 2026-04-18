'use client';

/**
 * SoundRouteListener — plays the `page-flip` sound on every client-side
 * route change. Zero-DOM component mounted once at the layout level.
 *
 * Rules (match the brief):
 *   - Skip the initial page load (the first render shouldn't flip).
 *   - Skip hash-only changes (same path + anchor scroll).
 *
 * The hook uses `usePathname` which excludes the hash by design, so any
 * fragment-only update won't trigger the effect. We ALSO skip when the
 * new pathname is identical to the tracked one (defensive — `usePathname`
 * should never invalidate for identical paths but some App Router branches
 * double-fire during streaming).
 */

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { soundManager } from '@/lib/soundManager';

export default function SoundRouteListener(): null {
  const pathname = usePathname();
  const previousPathRef = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousPathRef.current;
    // Initial mount: seed the ref and skip playback.
    if (previous === null) {
      previousPathRef.current = pathname;
      return;
    }
    // No-op for identical path (shouldn't happen but be safe).
    if (previous === pathname) return;
    previousPathRef.current = pathname;
    soundManager.play('page-flip');
  }, [pathname]);

  return null;
}
