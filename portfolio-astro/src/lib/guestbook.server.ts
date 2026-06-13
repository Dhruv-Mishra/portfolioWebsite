import 'server-only';

/**
 * Guestbook — server-only helpers.
 *
 * Thin wrappers over `lib/notes.server.ts` so the existing guestbook route +
 * page keep their import surface. See `lib/notes.server.ts` for the shared
 * GitHub-issue-backed storage implementation used by both the guestbook and
 * the matrix-notes surfaces.
 *
 * - `createPendingIssue`: POST a new GitHub issue with `guestbook-pending` label (called from
 *   the POST API route on submit). Dhruv manually reviews these and relabels to
 *   `guestbook-approved` to surface them on the wall.
 * - `getApprovedEntries`: fetch all `guestbook-approved` issues, parse bodies, and return the
 *   shape that the wall SSR render needs.
 */

import type { GuestbookEntry } from '@/lib/guestbook';
import {
  createPendingNoteIssue,
  getApprovedNotes,
  resolveNotesRepo,
  resolveNotesToken,
} from '@/lib/notes.server';

/** Read the guestbook repo from env (falls back to the shared feedback repo). */
export function resolveGuestbookRepo(): string | undefined {
  return resolveNotesRepo('guestbook');
}

/** Read the guestbook token from env (falls back to the shared feedback token). */
export function resolveGuestbookToken(): string | undefined {
  return resolveNotesToken('guestbook');
}

interface CreatePendingIssueArgs {
  message: string;
  name: string;
  ip: string;
}

/**
 * Create a `guestbook-pending` GitHub issue. Dhruv relabels to `guestbook-approved`
 * from the GitHub UI to surface the entry on the wall.
 *
 * Throws on network failure / non-2xx response. 10s upstream timeout via AbortController.
 */
export async function createPendingIssue(args: CreatePendingIssueArgs): Promise<void> {
  return createPendingNoteIssue({ ...args, kind: 'guestbook' });
}

/**
 * Fetch all `guestbook-approved` GitHub issues, parse bodies, and return a clean entry list.
 * Used by the wall SSR render. Returns an empty list on misconfig or upstream failure.
 */
export async function getApprovedEntries(): Promise<GuestbookEntry[]> {
  return getApprovedNotes('guestbook');
}
