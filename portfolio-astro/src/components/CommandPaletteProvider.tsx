"use client";

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

/**
 * Lazy-loaded palette UI. The heavy component (including icon set, theme
 * hook, router binding) is only pulled once the user opens the palette for
 * the first time.
 */
const CommandPalette = dynamic(() => import('@/components/CommandPalette'), {
  ssr: false,
  loading: () => null,
});

/**
 * CommandPaletteProvider — owns:
 *   - The open / closed state for the palette
 *   - The global `(⌘|Ctrl)+K` keydown listener
 *   - Bridging `open-feedback` and `open-shortcuts` CustomEvents so the
 *     palette's "Send feedback" and "Show shortcuts" actions reach the
 *     rest of the app without tight coupling.
 *
 * The palette component itself is dynamically imported on first open so that
 * its icon set + registry + theme hooks aren't in the initial bundle.
 *
 * This component must sit at the root (inside providers) — it's mounted by
 * `EagerEnhancements`.
 */
export default function CommandPaletteProvider() {
  const [isOpen, setIsOpen] = useState(false);

  // ── Global (Ctrl/⌘)+K listener ────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditableTarget = target?.isContentEditable || target?.matches('input, textarea, select');
      if (isEditableTarget || e.isComposing) return;

      // Match Cmd+K on macOS and Ctrl+K elsewhere. Leave Shift/Alt variants
      // to the browser/devtools and other application shortcuts.
      const isK = e.key.toLowerCase() === 'k' || e.code === 'KeyK';
      if (!isK) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.altKey || e.shiftKey) return;
      e.preventDefault();
      setIsOpen((open) => !open);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Custom event: external opens ─────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOpen = () => {
      setIsOpen(true);
    };
    window.addEventListener('open-command-palette', handleOpen);
    return () => window.removeEventListener('open-command-palette', handleOpen);
  }, []);

  const handleClose = useCallback(() => setIsOpen(false), []);

  // Bridge out to the rest of the app via CustomEvents.
  const openFeedback = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-feedback'));
    }
  }, []);

  const openShortcuts = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-shortcuts'));
    }
  }, []);

  return (
    <CommandPalette
      isOpen={isOpen}
      onClose={handleClose}
      openFeedback={openFeedback}
      openShortcuts={openShortcuts}
    />
  );
}
