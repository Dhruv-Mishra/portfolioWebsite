/**
 * Guestbook — shared types + SSR-safe pure helpers.
 *
 * This module is import-safe from both client and server. It contains no
 * secret-accessing code and no I/O. Server-only logic (GitHub API calls) lives
 * in `lib/guestbook.server.ts`.
 */

/** A single approved guestbook entry as rendered on the wall. */
export interface GuestbookEntry {
  /** GitHub issue number — stable integer used for hashing into color/rotation buckets. */
  id: number;
  /** Signer name (may be empty string → renders as "Anonymous"). */
  name: string;
  /** Message body (5–300 chars, markdown-sanitized on ingest). */
  message: string;
  /** ISO timestamp string (GitHub issue createdAt). */
  createdAt: string;
}

/** Client → server POST body shape for /api/guestbook. */
export interface GuestbookSubmission {
  /** Required message (5–300 chars after trim). */
  message: string;
  /** Optional signer name (≤40 chars after trim). */
  name?: string;
  /** Honeypot — must be empty on real submissions. Non-empty → silent 200. */
  website?: string;
}

/** Successful response from POST /api/guestbook. */
export interface GuestbookSubmitResponse {
  success: true;
}

/** Error response from POST /api/guestbook (rate-limit, validation, misconfig). */
export interface GuestbookErrorResponse {
  error: string;
}

/** Response from GET /api/guestbook. */
export interface GuestbookListResponse {
  entries: GuestbookEntry[];
}

// ─── Pure helpers ──────────────────────────────────────────────────────

/** Milliseconds in a single day — used by the 30-day relative-time cutoff. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Hard cutoff (days) below which we show a relative timestamp ("3 days ago"). */
const RELATIVE_CUTOFF_DAYS = 30;

/**
 * Format a guestbook entry's createdAt for display.
 *
 * - If `< 30 days ago`: relative ("3 days ago", "1 hour ago") via Intl.RelativeTimeFormat.
 * - Otherwise: short absolute date ("Jan 5") via Intl.DateTimeFormat.
 *
 * Deterministic with respect to `now` (pass a fixed value in tests for stability).
 * Designed to be SSR-stable when both server and client pass the same `now` (not done by
 * default — for SSR we render the absolute fallback path when the age exceeds the cutoff,
 * which is itself deterministic). Relative-time rendering may differ across the hydration
 * boundary for very recent entries; that's acceptable for a low-churn wall.
 */
export function formatRelativeOrShort(createdAt: string, now: Date = new Date()): string {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return '';

  const diffMs = now.getTime() - created.getTime();
  const diffDays = diffMs / MS_PER_DAY;

  if (diffDays < RELATIVE_CUTOFF_DAYS && diffDays >= 0) {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    // Pick the largest unit that yields |value| >= 1, falling through progressively.
    const diffSec = Math.round(diffMs / 1000);
    const absSec = Math.abs(diffSec);

    if (absSec < 60) return rtf.format(-diffSec, 'second');
    const diffMin = Math.round(diffSec / 60);
    if (Math.abs(diffMin) < 60) return rtf.format(-diffMin, 'minute');
    const diffHour = Math.round(diffMin / 60);
    if (Math.abs(diffHour) < 24) return rtf.format(-diffHour, 'hour');
    const diffDay = Math.round(diffHour / 24);
    return rtf.format(-diffDay, 'day');
  }

  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(created);
}

/**
 * Parse a GitHub issue body back into a `{ message, name }` pair.
 *
 * Issue body shape (see `createPendingIssue`):
 *   ## Message
 *
 *   <message text>
 *
 *   ## Name
 *
 *   <name text or "Anonymous">
 *
 *   <details><summary>Metadata</summary>...</details>
 *
 * This is a pure function so it can be shared between the GET route and the
 * server-side `getApprovedEntries()` helper.
 */
export function parseIssueBody(body: string): { message: string; name: string } {
  const MESSAGE_HEADER = '## Message';
  const NAME_HEADER = '## Name';
  const DETAILS_MARKER = '<details>';

  let message = '';
  let name = '';

  const msgStart = body.indexOf(MESSAGE_HEADER);
  const nameStart = body.indexOf(NAME_HEADER);

  if (msgStart !== -1) {
    const sliceStart = msgStart + MESSAGE_HEADER.length;
    const sliceEnd = nameStart !== -1 ? nameStart : body.length;
    message = unescapeMarkdown(body.slice(sliceStart, sliceEnd).trim());
  }

  if (nameStart !== -1) {
    const sliceStart = nameStart + NAME_HEADER.length;
    const detailsIdx = body.indexOf(DETAILS_MARKER, sliceStart);
    const hrIdx = body.indexOf('\n---', sliceStart);
    const ends: number[] = [];
    if (detailsIdx !== -1) ends.push(detailsIdx);
    if (hrIdx !== -1) ends.push(hrIdx);
    const sliceEnd = ends.length > 0 ? Math.min(...ends) : body.length;
    name = unescapeMarkdown(body.slice(sliceStart, sliceEnd).trim());
    if (name === 'Anonymous') name = '';
  }

  return { message, name };
}

/**
 * Reverse the backslash-escaping performed by `sanitizeMarkdown` on ingest.
 * Only removes backslashes that precede markdown-special characters — leaves
 * literal backslashes intact when they precede regular characters.
 */
function unescapeMarkdown(str: string): string {
  return str.replace(/\\([\[\]()@`|#*_!<>])/g, '$1');
}
