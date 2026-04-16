"use client";

import { useCallback, useEffect, useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { useDesktopOnly } from '@/hooks/useDesktopOnly';
import { Kbd } from '@/components/ui/Kbd';
import { Z_INDEX } from '@/lib/designTokens';

/**
 * ShortcutsHint — a small, handwritten-feeling nudge that teaches first-time
 * visitors about `⌘K` and `?`. Renders only on desktop (hover + fine pointer),
 * appears 1.5s after mount, auto-dismisses after 10s, and remembers its
 * dismissal in localStorage so it never nags twice.
 *
 * It also suppresses itself the moment the user starts using the keyboard —
 * if they've already pressed a modifier, they don't need the hint.
 */
const STORAGE_KEY = 'dhruv-shortcuts-hint-dismissed';
const AUTO_HIDE_MS = 10_000;
const ENTRANCE_DELAY_MS = 1500;

const MOTION_TRANSITION = { duration: 0.25 } as const;
const MOTION_INITIAL = { opacity: 0, y: 8 } as const;
const MOTION_ANIMATE = { opacity: 1, y: 0 } as const;
const MOTION_EXIT = { opacity: 0, y: 8 } as const;
const CONTAINER_STYLE = { zIndex: Z_INDEX.sidebar } as const;

export default function ShortcutsHint() {
  const isDesktop = useDesktopOnly();
  const [show, setShow] = useState(false);

  // ── Entrance scheduling ──────────────────────────────────────────
  useEffect(() => {
    if (!isDesktop) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      /* localStorage may be disabled (Safari private mode, etc.) — ignore */
    }
    if (dismissed) return;
    const t = window.setTimeout(() => setShow(true), ENTRANCE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [isDesktop]);

  // ── Auto-hide timer ──────────────────────────────────────────────
  useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(() => setShow(false), AUTO_HIDE_MS);
    return () => window.clearTimeout(t);
  }, [show]);

  const dismiss = useCallback(() => {
    setShow(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore — hint just won't persist dismissal */
    }
  }, []);

  // ── Suppress on first real key press ─────────────────────────────
  // Once the user reaches for the keyboard, they don't need the hint.
  useEffect(() => {
    if (!show) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.key === 'Escape' || e.key === '?') {
        dismiss();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [show, dismiss]);

  if (!isDesktop) return null;

  return (
    <AnimatePresence>
      {show && (
        <m.div
          initial={MOTION_INITIAL}
          animate={MOTION_ANIMATE}
          exit={MOTION_EXIT}
          transition={MOTION_TRANSITION}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 pointer-events-none select-none"
          style={CONTAINER_STYLE}
        >
          <button
            type="button"
            onClick={dismiss}
            className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--c-paper)]/85 backdrop-blur-sm border-2 border-dashed border-[var(--c-grid)]/50 shadow-md font-hand text-xs text-[var(--c-ink)]/75 hover:text-[var(--c-ink)] hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-ink)]/40"
          >
            <span>press</span>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
            <span>to jump around</span>
            <span className="opacity-40">·</span>
            <Kbd>?</Kbd>
            <span>shortcuts</span>
            <span className="sr-only">(click to dismiss)</span>
          </button>
        </m.div>
      )}
    </AnimatePresence>
  );
}
