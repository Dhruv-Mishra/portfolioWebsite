// app/api/matrix-notes/route.ts — Matrix-notes submission + listing API.
//
// Mirrors the guestbook route but stores entries under the `matrix-notes-*`
// labels so Dhruv can moderate the two walls independently. The backend
// (GitHub issues, markdown sanitization, pending → approved
// label flip) is SHARED with the guestbook via `lib/notes.server.ts` — we
// only parameterize the `kind` discriminator.
//
// Auth gate:
//   Both methods verify the signed HttpOnly access cookie before doing any
//   other work. Unauthorized requests receive an empty 404 so the API does
//   not reveal whether the hidden route exists. POST retains origin checks,
//   transient IP rate limiting, honeypot handling, and strict validation.

import { NextRequest } from 'next/server';
import { BoundedJsonError, getBoundedJsonErrorMessage, readBoundedJson } from '@/lib/boundedJson.server';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { validateOrigin } from '@/lib/validateOrigin';
import {
  createPendingNoteIssue,
  getApprovedNotes,
  resolveNotesRepo,
  resolveNotesToken,
} from '@/lib/notes.server';
import { GUESTBOOK_LIMITS } from '@/lib/designTokens';
import type { GuestbookEntry } from '@/lib/guestbook';
import { MATRIX_FILLER_NOTES } from '@/lib/matrixFillerNotes';
import {
  MATRIX_NOTES_ACCESS_COOKIE,
  verifyMatrixNotesAccessToken,
} from '@/lib/matrixNotesAccess.server';

export const runtime = 'nodejs';

// ─── Rate limiter: 3 submissions per 10 min per IP ──────────────────────
// Same budget as the guestbook — a human posting thoughtfully won't hit it,
// but spam / automated floods get cut off early.
const matrixNotesRateLimiter = createServerRateLimiter({
  maxRequests: 3,
  windowMs: 600_000,
  maxTrackedIPs: 200,
  cleanupInterval: 30,
});
const MAX_MATRIX_NOTES_BODY_BYTES = 4_000;

// ─── Validation helpers ─────────────────────────────────────────────────
const URL_PATTERN = /(?:https?:\/\/|www\.)/i;

interface SubmissionBody {
  message?: unknown;
  name?: unknown;
  website?: unknown;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function hasMatrixNotesAccess(request: NextRequest): boolean {
  return verifyMatrixNotesAccessToken(
    request.cookies.get(MATRIX_NOTES_ACCESS_COOKIE)?.value,
  );
}

function notFoundResponse(): Response {
  return new Response(null, {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

// ─── POST /api/matrix-notes — new entry submission ──────────────────────
export async function POST(request: NextRequest) {
  try {
    if (!hasMatrixNotesAccess(request)) return notFoundResponse();

    const originError = validateOrigin(request, { requireOrigin: true });
    if (originError) return originError;

    const ip = getClientIP(request);

    const { limited, retryAfter } = matrixNotesRateLimiter.check(ip);
    if (limited) {
      return Response.json(
        { error: `Whoa, let the matrix catch up. Try again in ${retryAfter}s.` },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }

    let body: SubmissionBody;
    try {
      body = await readBoundedJson<SubmissionBody>(request, MAX_MATRIX_NOTES_BODY_BYTES);
    } catch (error) {
      if (error instanceof BoundedJsonError) {
        return Response.json({ error: getBoundedJsonErrorMessage(error) }, { status: error.status });
      }
      throw error;
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Honeypot — non-empty `website` → silent success (bot signature).
    if (asString(body.website).trim().length > 0) {
      return Response.json({ success: true });
    }

    // Validate message. Same shape + limits as the guestbook.
    const rawMessage = asString(body.message);
    if (rawMessage.length > GUESTBOOK_LIMITS.maxMessageLength) {
      return Response.json({ error: 'Message too long.' }, { status: 400 });
    }
    const message = rawMessage.trim();
    if (!message || message.length < 5) {
      return Response.json(
        { error: 'Message must be at least 5 characters.' },
        { status: 400 },
      );
    }
    if (URL_PATTERN.test(message)) {
      return Response.json(
        { error: 'Links are not allowed in matrix notes.' },
        { status: 400 },
      );
    }

    // Validate name.
    const submittedName = asString(body.name);
    if (submittedName.length > GUESTBOOK_LIMITS.maxNameLength) {
      return Response.json({ error: 'Name too long.' }, { status: 400 });
    }
    const rawName = submittedName.trim();
    const name = rawName.replace(/\r?\n/g, ' ').replace(/^@+/, '').trim();
    if (name && URL_PATTERN.test(name)) {
      return Response.json(
        { error: 'Links are not allowed in matrix notes.' },
        { status: 400 },
      );
    }

    // Ensure env is configured before hitting GitHub.
    if (!resolveNotesRepo('matrix') || !resolveNotesToken('matrix')) {
      console.error(
        '[matrix-notes] Missing GITHUB_MATRIX_NOTES_TOKEN/REPO (or fallback GUESTBOOK/FEEDBACK_*) env vars',
      );
      return Response.json({ error: 'Matrix notes not configured' }, { status: 500 });
    }

    try {
      await createPendingNoteIssue({ kind: 'matrix', message, name, ip });
    } catch (err) {
      console.error('[matrix-notes] createPendingNoteIssue failed:', err);
      return Response.json(
        { error: 'The transmission glitched — try again.' },
        { status: 502 },
      );
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('[matrix-notes] POST error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── GET /api/matrix-notes — list approved entries (merged w/ filler) ────
//
// Returns the approved matrix-notes entries merged with the in-character
// filler notes (newest first). Used by the `/matrix-notes` page which
// fetches this client-side after the server page verifies access. This
// endpoint repeats verification so direct listing requests remain denied.
//
// Cache: no-store. The wall is low-traffic and the moderator-approved
// surface should always be fresh. Cloudflare will still honor the
// Cache-Control header for intermediate caches if we ever add one.
export async function GET(request: NextRequest) {
  if (!hasMatrixNotesAccess(request)) return notFoundResponse();

  const repo = resolveNotesRepo('matrix');
  const token = resolveNotesToken('matrix');
  // Env misconfig → return filler only. Better than a 500 that leaks the
  // route's existence.
  if (!repo || !token) {
    return Response.json({ entries: [...MATRIX_FILLER_NOTES] } satisfies { entries: GuestbookEntry[] });
  }

  const approved = await getApprovedNotes('matrix');
  // Merge + sort newest first. Filler IDs are negative so they never
  // collide with GitHub issue numbers.
  const entries = [...approved, ...MATRIX_FILLER_NOTES].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return tb - ta;
  });

  return Response.json(
    { entries } satisfies { entries: GuestbookEntry[] },
    {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    },
  );
}
