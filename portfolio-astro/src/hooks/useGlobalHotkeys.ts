"use client";

import { useEffect, useRef } from 'react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { CHORD_ROUTE_MAP, CHORD_WINDOW_MS } from '@/lib/keybindings';

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Return true when the current focus target is a user-editable field —
 * we never hijack keys while the user is typing.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

interface UseGlobalHotkeysArgs {
  /** Next.js router — used for chord navigation (`g` then letter) */
  router: AppRouterInstance;
  /** Opens the shortcuts overlay (typically bound to `?`) */
  openShortcuts: () => void;
  /** Toggles theme (typically bound to `t`) */
  toggleTheme: () => void;
  /** When false, the hook is a no-op (e.g. SSR / disabled state) */
  enabled?: boolean;
}

/**
 * Global single-listener hotkey handler. Recognized bindings:
 *   `?`              — open shortcuts overlay (suppressed on no-hover devices)
 *   `t`              — toggle theme
 *   `g <letter>`     — chord-navigate to a route (expires after 1.2s)
 *
 * A single `window.keydown` listener is mounted — all branching happens in the
 * handler so that (a) we don't stack up listeners and (b) chord state is
 * encapsulated via a ref.
 *
 * The handler bails out if the user is typing in an input/textarea/contentEditable.
 */
export function useGlobalHotkeys({
  router,
  openShortcuts,
  toggleTheme,
  enabled = true,
}: UseGlobalHotkeysArgs): void {
  // Refs give the handler a stable identity that still reads the latest props.
  const routerRef = useRef(router);
  const openShortcutsRef = useRef(openShortcuts);
  const toggleThemeRef = useRef(toggleTheme);

  routerRef.current = router;
  openShortcutsRef.current = openShortcuts;
  toggleThemeRef.current = toggleTheme;

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    // Probe pointer capability — `?` is a power-user shortcut and is suppressed
    // on touch-only devices (no hardware keyboard). Chord nav is left enabled
    // because external keyboards still send `g`, even on hybrid devices.
    const hoverMql = window.matchMedia('(hover: hover) and (pointer: fine)');

    let chordArmed = false;
    let chordTimer: ReturnType<typeof setTimeout> | null = null;

    const disarmChord = () => {
      chordArmed = false;
      if (chordTimer) {
        clearTimeout(chordTimer);
        chordTimer = null;
      }
    };

    const armChord = () => {
      chordArmed = true;
      if (chordTimer) clearTimeout(chordTimer);
      chordTimer = setTimeout(disarmChord, CHORD_WINDOW_MS);
    };

    const handler = (e: KeyboardEvent) => {
      // Never hijack when the user is typing somewhere.
      if (isEditableTarget(e.target)) {
        disarmChord();
        return;
      }
      // Never hijack when the user is in the middle of a composing input.
      if (e.isComposing) return;
      // Ignore bindings with ctrl/meta/alt — those belong to system shortcuts
      // or to the palette itself (handled elsewhere).
      if (e.ctrlKey || e.metaKey || e.altKey) {
        disarmChord();
        return;
      }

      const key = e.key;

      // ── Chord continuation: `g` was pressed, now look for letter ──
      if (chordArmed) {
        const target = CHORD_ROUTE_MAP[key.toLowerCase()];
        disarmChord();
        if (target) {
          e.preventDefault();
          routerRef.current.push(target);
          return;
        }
        // No matching route — fall through so keys like `?`, `t`, or another
        // `g` still reach their handlers instead of being swallowed by the
        // disarmed chord.
      }

      // ── `?` → show shortcuts (requires shift in most layouts) ──
      if (key === '?') {
        if (!hoverMql.matches) return; // suppressed on touch-only devices
        e.preventDefault();
        openShortcutsRef.current();
        return;
      }

      // ── `t` → toggle theme ──
      if (key === 't' || key === 'T') {
        e.preventDefault();
        toggleThemeRef.current();
        return;
      }

      // ── `g` → arm chord ──
      if (key === 'g' || key === 'G') {
        armChord();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      disarmChord();
    };
  }, [enabled]);
}
