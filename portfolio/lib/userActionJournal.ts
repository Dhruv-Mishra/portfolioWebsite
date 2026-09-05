import { VALID_NAVIGATION_PATHS } from '@/lib/actions';
import { isProjectSlug, type ProjectSlug } from '@/lib/projectCatalog';

export const USER_ACTION_JOURNAL_STORAGE_KEY = 'dhruv-user-actions-v1';
export const USER_ACTION_JOURNAL_MAX_ENTRIES = 10;
export const USER_ACTION_JOURNAL_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
export const USER_ACTION_DEDUPE_WINDOW_MS = 2000; // 2 seconds
export const USER_ACTION_JOURNAL_MAX_RAW_BYTES = 8192; // 8 KB safety cap
export const USER_ACTION_JOURNAL_MAX_EXPOSED_ACTIONS = 3;

export type UserActionRoute = (typeof VALID_NAVIGATION_PATHS)[number];

export const PUBLIC_TERMINAL_COMMANDS = [
  'about',
  'contact',
  'projects',
  'guestbook',
  'sign',
  'settings',
  'stickers',
  'resume',
  'cv',
  'chat',
  'socials',
  'github',
  'linkedin',
  'skills',
  'feedback',
] as const;

export type PublicTerminalCommand = (typeof PUBLIC_TERMINAL_COMMANDS)[number];
const PUBLIC_TERMINAL_COMMAND_SET = new Set<string>(PUBLIC_TERMINAL_COMMANDS);
const ROUTE_SET = new Set<string>(VALID_NAVIGATION_PATHS);

export type UserAction =
  | { kind: 'route.view'; route: UserActionRoute }
  | { kind: 'project.open'; slug: ProjectSlug }
  | { kind: 'terminal.run'; command: PublicTerminalCommand }
  | { kind: 'chat.sent' }
  | { kind: 'feedback.submit' }
  | { kind: 'guestbook.submit' };

export type UserActionKind = UserAction['kind'];

export type UserActionEntry = UserAction & { timestamp: number };

export function isPublicTerminalCommand(value: unknown): value is PublicTerminalCommand {
  return typeof value === 'string' && PUBLIC_TERMINAL_COMMAND_SET.has(value);
}

export function sanitizeRoute(value: unknown): UserActionRoute | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
  return ROUTE_SET.has(trimmed) ? (trimmed as UserActionRoute) : null;
}

export function sanitizeUserAction(raw: unknown): UserAction | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const kind = record.kind;
  if (typeof kind !== 'string') return null;

  switch (kind) {
    case 'route.view': {
      const route = sanitizeRoute(record.route);
      if (!route) return null;
      return { kind: 'route.view', route };
    }
    case 'project.open': {
      const slug = record.slug;
      if (typeof slug !== 'string' || !isProjectSlug(slug)) return null;
      return { kind: 'project.open', slug };
    }
    case 'terminal.run': {
      const command = record.command;
      if (!isPublicTerminalCommand(command)) return null;
      return { kind: 'terminal.run', command };
    }
    case 'chat.sent':
      return { kind: 'chat.sent' };
    case 'feedback.submit':
      return { kind: 'feedback.submit' };
    case 'guestbook.submit':
      return { kind: 'guestbook.submit' };
    default:
      return null;
  }
}

export function sanitizeUserActionEntry(
  raw: unknown,
  now: number = Date.now(),
): UserActionEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const timestamp = record.timestamp;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return null;
  if (now - timestamp > USER_ACTION_JOURNAL_MAX_AGE_MS || timestamp - now > 60_000) {
    return null;
  }
  const action = sanitizeUserAction(raw);
  if (!action) return null;
  return { ...action, timestamp };
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isConsecutiveDuplicate(
  last: UserActionEntry,
  next: UserAction,
  timestamp: number,
): boolean {
  if (timestamp - last.timestamp > USER_ACTION_DEDUPE_WINDOW_MS || timestamp < last.timestamp) {
    return false;
  }
  if (next.kind === 'route.view' && last.kind === 'route.view') {
    return last.route === next.route;
  }
  if (next.kind === 'project.open' && last.kind === 'project.open') {
    return last.slug === next.slug;
  }
  return false;
}

export function readUserActionJournal(now: number = Date.now()): UserActionEntry[] {
  const storage = getSessionStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(USER_ACTION_JOURNAL_STORAGE_KEY);
    if (!raw || raw.length > USER_ACTION_JOURNAL_MAX_RAW_BYTES) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const candidates =
      parsed.length > USER_ACTION_JOURNAL_MAX_ENTRIES * 2
        ? parsed.slice(-USER_ACTION_JOURNAL_MAX_ENTRIES * 2)
        : parsed;
    const entries: UserActionEntry[] = [];
    for (const item of candidates) {
      const entry = sanitizeUserActionEntry(item, now);
      if (entry) {
        entries.push(entry);
      }
    }
    return entries.slice(-USER_ACTION_JOURNAL_MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function appendUserAction(
  action: UserAction,
  timestamp: number = Date.now(),
): void {
  const sanitized = sanitizeUserAction(action);
  if (!sanitized) return;

  const storage = getSessionStorage();
  if (!storage) return;

  try {
    const current = readUserActionJournal(timestamp);
    const last = current[current.length - 1];
    if (last && isConsecutiveDuplicate(last, sanitized, timestamp)) {
      return;
    }
    const newEntry: UserActionEntry = { ...sanitized, timestamp };
    const next = [...current, newEntry].slice(-USER_ACTION_JOURNAL_MAX_ENTRIES);
    storage.setItem(USER_ACTION_JOURNAL_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota or serialization errors
  }
}

export function formatUserAction(action: UserAction): string {
  switch (action.kind) {
    case 'route.view':
      return `route.view ${action.route}`;
    case 'project.open':
      return `project.open ${action.slug}`;
    case 'terminal.run':
      return `terminal.run ${action.command}`;
    case 'chat.sent':
      return 'chat.sent';
    case 'feedback.submit':
      return 'feedback.submit';
    case 'guestbook.submit':
      return 'guestbook.submit';
  }
}

export function formatUserActionJournal(
  entries: readonly UserActionEntry[] = readUserActionJournal(),
): string[] {
  const visible =
    entries.length > USER_ACTION_JOURNAL_MAX_EXPOSED_ACTIONS
      ? entries.slice(-USER_ACTION_JOURNAL_MAX_EXPOSED_ACTIONS)
      : entries;
  return visible.map(formatUserAction);
}
