"use client";

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useGlobalHotkeys } from '@/hooks/useGlobalHotkeys';
import { useDiscoActive } from '@/hooks/useStickers';
import { runThemeToggle } from '@/lib/themeToggleAction';

/**
 * Lazy-loaded overlay UI. The overlay is only pulled the first time the
 * user requests it via `?` or a site action.
 */
const ShortcutsOverlay = dynamic(() => import('@/components/ShortcutsOverlay'), {
  ssr: false,
  loading: () => null,
});

/**
 * ShortcutsOverlayProvider — owns:
 *   - The open / closed state for the shortcuts overlay
 *   - The `open-shortcuts` CustomEvent bridge for site actions
 *   - All global hotkeys (`?`, `t`, and the `g <letter>` chord). The hotkey
 *     hook itself suppresses `?` on touch-only devices.
 *
 * Sits at the root (inside providers) — mounted by `EagerEnhancements`.
 */
export default function ShortcutsOverlayProvider() {
  const [overlay, setOverlay] = useState({ isOpen: false, hasOpened: false });
  const { isOpen, hasOpened } = overlay;
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const discoActive = useDiscoActive();

  const handleOpen = useCallback(() => {
    setOverlay((current) => (
      current.isOpen && current.hasOpened
        ? current
        : { isOpen: true, hasOpened: true }
    ));
  }, []);
  const handleClose = useCallback(() => {
    setOverlay((current) => (
      current.isOpen ? { ...current, isOpen: false } : current
    ));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('open-shortcuts', handleOpen);
    return () => window.removeEventListener('open-shortcuts', handleOpen);
  }, [handleOpen]);

  // Theme toggle action — consumed by the global hotkey hook for `t`.
  const toggleTheme = useCallback(() => {
    runThemeToggle({
      discoActive,
      isDark: resolvedTheme === 'dark',
      setTheme,
    });
  }, [discoActive, resolvedTheme, setTheme]);

  useGlobalHotkeys({
    router,
    openShortcuts: handleOpen,
    toggleTheme,
  });

  if (!hasOpened) return null;

  return <ShortcutsOverlay isOpen={isOpen} onClose={handleClose} />;
}
