"use client";

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useGlobalHotkeys } from '@/hooks/useGlobalHotkeys';

/**
 * Lazy-loaded overlay UI. The overlay is only pulled the first time the
 * user requests it — either via `?` or via the palette action.
 */
const ShortcutsOverlay = dynamic(() => import('@/components/ShortcutsOverlay'), {
  ssr: false,
  loading: () => null,
});

/**
 * ShortcutsOverlayProvider — owns:
 *   - The open / closed state for the shortcuts overlay
 *   - The `open-shortcuts` CustomEvent bridge (dispatched by the palette)
 *   - All global hotkeys (`?`, `t`, and the `g <letter>` chord). The hotkey
 *     hook itself suppresses `?` on touch-only devices.
 *
 * Sits at the root (inside providers) — mounted by `EagerEnhancements`.
 */
export default function ShortcutsOverlayProvider() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  const handleOpen = useCallback(() => setIsOpen(true), []);
  const handleClose = useCallback(() => setIsOpen(false), []);

  // Bridge from CustomEvent (used by the palette).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('open-shortcuts', handleOpen);
    return () => window.removeEventListener('open-shortcuts', handleOpen);
  }, [handleOpen]);

  // Theme toggle action — consumed by the global hotkey hook for `t`.
  const toggleTheme = useCallback(() => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  useGlobalHotkeys({
    router,
    openShortcuts: handleOpen,
    toggleTheme,
  });

  return <ShortcutsOverlay isOpen={isOpen} onClose={handleClose} />;
}
