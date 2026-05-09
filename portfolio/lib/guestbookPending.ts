import { GUESTBOOK_LIMITS } from '@/lib/designTokens';
import type { GuestbookEntry } from '@/lib/guestbook';

export interface PendingGuestbookEntry {
  id: string;
  message: string;
  name: string;
  createdAt: string;
}

export const GUESTBOOK_PENDING_STORAGE_KEY = 'dhruv:guestbook:pending:v1';
export const GUESTBOOK_PENDING_CHANGED_EVENT = 'guestbook:pending-changed';

const MAX_PENDING_ENTRIES = 6;
const MAX_PENDING_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function normalizeName(value: string): string {
  const normalized = normalizeText(value.replace(/^@+/, ''));
  return normalized === 'anonymous' ? '' : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function dispatchPendingChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(GUESTBOOK_PENDING_CHANGED_EVENT));
}

function parsePendingEntry(value: unknown): PendingGuestbookEntry | null {
  if (!isRecord(value)) return null;

  const rawMessage = typeof value.message === 'string' ? value.message.trim() : '';
  if (
    rawMessage.length < GUESTBOOK_LIMITS.minMessageLength ||
    rawMessage.length > GUESTBOOK_LIMITS.maxMessageLength
  ) {
    return null;
  }

  const rawName = typeof value.name === 'string' ? value.name.trim() : '';
  if (rawName && rawName.length < GUESTBOOK_LIMITS.minNameLength) return null;
  if (rawName.length > GUESTBOOK_LIMITS.maxNameLength) return null;

  const rawCreatedAt = typeof value.createdAt === 'string' ? value.createdAt : '';
  const createdAtTime = Date.parse(rawCreatedAt);
  const createdAt = Number.isNaN(createdAtTime) ? new Date().toISOString() : rawCreatedAt;
  if (Date.now() - Date.parse(createdAt) > MAX_PENDING_AGE_MS) return null;

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : createId(),
    message: rawMessage,
    name: rawName,
    createdAt,
  };
}

function pendingMatchesApproved(pending: PendingGuestbookEntry, approved: GuestbookEntry): boolean {
  return (
    normalizeText(pending.message) === normalizeText(approved.message) &&
    normalizeName(pending.name) === normalizeName(approved.name)
  );
}

function pendingMatchesPending(a: PendingGuestbookEntry, b: PendingGuestbookEntry): boolean {
  return normalizeText(a.message) === normalizeText(b.message) && normalizeName(a.name) === normalizeName(b.name);
}

export function getPendingGuestbookEntries(): PendingGuestbookEntry[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(GUESTBOOK_PENDING_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(parsePendingEntry)
      .filter((entry): entry is PendingGuestbookEntry => entry !== null)
      .slice(0, MAX_PENDING_ENTRIES);
  } catch {
    return [];
  }
}

export function setPendingGuestbookEntries(entries: readonly PendingGuestbookEntry[]): void {
  if (typeof window === 'undefined') return;

  const nextEntries = entries.slice(0, MAX_PENDING_ENTRIES);

  try {
    if (nextEntries.length === 0) {
      window.localStorage.removeItem(GUESTBOOK_PENDING_STORAGE_KEY);
    } else {
      window.localStorage.setItem(GUESTBOOK_PENDING_STORAGE_KEY, JSON.stringify(nextEntries));
    }
    dispatchPendingChanged();
  } catch {
    // localStorage may be unavailable; the submitted review still reached the API.
  }
}

export function addPendingGuestbookEntry(input: { message: string; name: string }): PendingGuestbookEntry | null {
  const entry = parsePendingEntry({ ...input, id: createId(), createdAt: new Date().toISOString() });
  if (!entry) return null;

  const dedupedEntries = getPendingGuestbookEntries().filter((pending) => !pendingMatchesPending(pending, entry));
  setPendingGuestbookEntries([entry, ...dedupedEntries]);
  return entry;
}

export function removeApprovedPendingGuestbookEntries(
  pendingEntries: readonly PendingGuestbookEntry[],
  approvedEntries: readonly GuestbookEntry[],
): PendingGuestbookEntry[] {
  return pendingEntries.filter(
    (pending) => !approvedEntries.some((approved) => pendingMatchesApproved(pending, approved)),
  );
}
