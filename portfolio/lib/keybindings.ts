/**
 * Keybinding registry — single source of truth for all global keyboard shortcuts.
 *
 * Each binding carries the human-readable label and the chord sequence. The
 * Shortcuts Overlay consumes this list directly; `useGlobalHotkeys` uses the
 * `keys` field to recognize chord sequences at runtime.
 *
 * Chord format: multi-key sequences use the `then` semantic (e.g. `['g', 'p']`
 * means press `g` then `p` within the chord window).
 */

/** Grouping sections shown in the Shortcuts Overlay */
export type KeybindingGroup = 'Navigate' | 'Actions' | 'Dismiss';

export interface Keybinding {
  /** Stable identifier for the binding (also used by CommandContext routing) */
  id: string;
  /** Ordered key sequence — single-key bindings use a single-element array */
  keys: string[];
  /** Human-readable label shown in the overlay */
  label: string;
  /** Section grouping */
  group: KeybindingGroup;
}

/** Static keybinding list — ordered by group + visual priority */
export const KEYBINDINGS: Keybinding[] = [
  // ── Navigate ────────────────────────────────────────────────────
  { id: 'nav-home', keys: ['g', 'h'], label: 'Go to Home', group: 'Navigate' },
  { id: 'nav-projects', keys: ['g', 'p'], label: 'Go to Projects', group: 'Navigate' },
  { id: 'nav-about', keys: ['g', 'a'], label: 'Go to About', group: 'Navigate' },
  { id: 'nav-resume', keys: ['g', 'r'], label: 'Go to Resume', group: 'Navigate' },
  { id: 'nav-chat', keys: ['g', 'c'], label: 'Go to Chat', group: 'Navigate' },
  { id: 'nav-guestbook', keys: ['g', 'b'], label: 'Go to Guestbook', group: 'Navigate' },
  { id: 'nav-stickers', keys: ['g', 's'], label: 'Go to Stickers', group: 'Navigate' },

  // ── Actions ─────────────────────────────────────────────────────
  { id: 'action-palette', keys: ['⌘', 'K'], label: 'Open Command Palette', group: 'Actions' },
  { id: 'action-theme', keys: ['t'], label: 'Toggle Theme', group: 'Actions' },
  { id: 'action-shortcuts', keys: ['?'], label: 'Show Shortcuts', group: 'Actions' },

  // ── Dismiss ─────────────────────────────────────────────────────
  { id: 'dismiss-esc', keys: ['Esc'], label: 'Close overlay / palette', group: 'Dismiss' },
];

/** Chord-navigation map — used by useGlobalHotkeys for the `g <letter>` chord */
export const CHORD_ROUTE_MAP: Readonly<Record<string, string>> = {
  h: '/',
  p: '/projects',
  a: '/about',
  r: '/resume',
  c: '/chat',
  b: '/guestbook',
  s: '/stickers',
};

/** Chord window — how long after pressing `g` before the chord expires (ms) */
export const CHORD_WINDOW_MS = 1200;
