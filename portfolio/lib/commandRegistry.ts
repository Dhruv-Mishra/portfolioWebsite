/**
 * Command Registry — single source of truth for the Command Palette entries.
 *
 * Entries are grouped into three sections (Navigation / Actions / Terminal) but
 * the Terminal group is intentionally empty in v1 — the wiring from palette →
 * terminal ship later. Each entry carries a `run(ctx)` handler that receives
 * the runtime context (router, theme setter, etc.) and performs the action.
 *
 * Search is a simple case-insensitive contains-match over `label + keywords`.
 * Matches the static nature of the list — no fuzzy lib, no ranking.
 */

import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { ComponentType } from 'react';
import {
  Home,
  FolderKanban,
  User,
  FileText,
  MessageCircle,
  Pencil,
  Sticker,
  SunMoon,
  Send,
  Keyboard,
  AtSign,
  Github,
} from 'lucide-react';
import { PERSONAL_LINKS } from '@/lib/links';

// ── Types ──────────────────────────────────────────────────────────────

export type CommandGroup = 'Navigation' | 'Actions' | 'Terminal';

export interface CommandContext {
  router: AppRouterInstance;
  setTheme: (t: 'light' | 'dark') => void;
  resolvedTheme: string | undefined;
  openFeedback: () => void;
  openShortcuts: () => void;
  runTerminalCommand: (cmd: string) => void;
}

export interface CommandEntry {
  id: string;
  label: string;
  keywords: string[];
  group: CommandGroup;
  keyboardHint?: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  run: (ctx: CommandContext) => void | Promise<void>;
}

// ── Static entry list ─────────────────────────────────────────────────

/**
 * Build the static command entry list. The function shape lets us defer
 * any future dynamic-entry logic (recents, featured) without changing the
 * call site.
 */
export function buildCommandEntries(): CommandEntry[] {
  return [
    // ── Navigation ────────────────────────────────────────────────
    {
      id: 'nav-home',
      label: 'Home',
      keywords: ['home', 'landing', 'start', 'index'],
      group: 'Navigation',
      keyboardHint: 'g h',
      icon: Home,
      run: (ctx) => ctx.router.push('/'),
    },
    {
      id: 'nav-projects',
      label: 'Projects',
      keywords: ['projects', 'work', 'portfolio', 'case studies'],
      group: 'Navigation',
      keyboardHint: 'g p',
      icon: FolderKanban,
      run: (ctx) => ctx.router.push('/projects'),
    },
    {
      id: 'nav-about',
      label: 'About',
      keywords: ['about', 'bio', 'story', 'who'],
      group: 'Navigation',
      keyboardHint: 'g a',
      icon: User,
      run: (ctx) => ctx.router.push('/about'),
    },
    {
      id: 'nav-resume',
      label: 'Resume',
      keywords: ['resume', 'cv', 'experience'],
      group: 'Navigation',
      keyboardHint: 'g r',
      icon: FileText,
      run: (ctx) => ctx.router.push('/resume'),
    },
    {
      id: 'nav-chat',
      label: 'Chat',
      keywords: ['chat', 'ai', 'talk', 'ask'],
      group: 'Navigation',
      keyboardHint: 'g c',
      icon: MessageCircle,
      run: (ctx) => ctx.router.push('/chat'),
    },
    {
      id: 'nav-guestbook',
      label: 'Guestbook',
      keywords: ['guestbook', 'sign', 'leave note', 'wall'],
      group: 'Navigation',
      keyboardHint: 'g b',
      icon: Pencil,
      run: (ctx) => ctx.router.push('/guestbook'),
    },
    {
      id: 'nav-stickers',
      label: 'Stickers',
      keywords: ['stickers', 'collection', 'drawer', 'earned'],
      group: 'Navigation',
      keyboardHint: 'g s',
      icon: Sticker,
      run: (ctx) => ctx.router.push('/stickers'),
    },

    // ── Actions ─────────────────────────────────────────────────
    {
      id: 'action-toggle-theme',
      label: 'Toggle theme',
      keywords: ['theme', 'dark', 'light', 'mode', 'color'],
      group: 'Actions',
      keyboardHint: 't',
      icon: SunMoon,
      run: (ctx) => {
        const next = ctx.resolvedTheme === 'dark' ? 'light' : 'dark';
        ctx.setTheme(next);
      },
    },
    {
      id: 'action-send-feedback',
      label: 'Send feedback',
      keywords: ['feedback', 'bug', 'report', 'idea', 'scribble'],
      group: 'Actions',
      icon: Send,
      run: (ctx) => ctx.openFeedback(),
    },
    {
      id: 'action-show-shortcuts',
      label: 'Show keyboard shortcuts',
      keywords: ['shortcuts', 'keybinds', 'hotkeys', 'help', 'kbd'],
      group: 'Actions',
      keyboardHint: '?',
      icon: Keyboard,
      run: (ctx) => ctx.openShortcuts(),
    },
    {
      id: 'action-copy-email',
      label: 'Copy email',
      keywords: ['email', 'mail', 'contact', 'copy'],
      group: 'Actions',
      icon: AtSign,
      run: async () => {
        if (typeof window === 'undefined' || !navigator.clipboard) return;
        // PERSONAL_LINKS.email is a `mailto:` URL — strip the scheme.
        const address = PERSONAL_LINKS.email.replace(/^mailto:/, '');
        try {
          await navigator.clipboard.writeText(address);
        } catch {
          /* silently ignore clipboard denial */
        }
      },
    },
    {
      id: 'action-view-github',
      label: 'View GitHub',
      keywords: ['github', 'code', 'repos', 'git'],
      group: 'Actions',
      icon: Github,
      run: () => {
        if (typeof window !== 'undefined') {
          window.open(PERSONAL_LINKS.github, '_blank', 'noopener,noreferrer');
        }
      },
    },

    // ── Terminal ────────────────────────────────────────────────
    // v1: intentionally empty. Terminal category entries were dropped so the
    // palette doesn't dispatch events that lack a listener. Future phase will
    // reintroduce them once the Terminal component wires `run-terminal-command`.
  ];
}

// ── Search ────────────────────────────────────────────────────────────

/**
 * Case-insensitive contains-match over `label + keywords`. Empty queries
 * return the full list. Results preserve the caller-supplied ordering —
 * callers group downstream.
 */
export function searchCommands(
  entries: CommandEntry[],
  q: string,
): CommandEntry[] {
  const query = q.trim().toLowerCase();
  if (!query) return entries;
  return entries.filter((entry) => {
    if (entry.label.toLowerCase().includes(query)) return true;
    return entry.keywords.some((kw) => kw.toLowerCase().includes(query));
  });
}
