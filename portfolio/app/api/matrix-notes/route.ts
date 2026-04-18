// app/api/matrix-notes/route.ts — Matrix-notes submission + listing API.
//
// Mirrors the guestbook route but stores entries under the `matrix-notes-*`
// labels so Dhruv can moderate the two walls independently. The backend
// (GitHub issues, markdown sanitization, IP hashing, pending → approved
// label flip) is SHARED with the guestbook via `lib/notes.server.ts` — we
// only parameterize the `kind` discriminator.
//
// Auth gate:
//   The page at `/matrix-notes` gates VIEW access on the client-side
//   `matrixEscaped` localStorage flag. This API route does NOT gate POST
//   access on that flag — there's no server-side signal for it and we
//   don't want to leak the route's existence via 403s either. Instead we
//   rely on the same rate-limit + origin-check posture as the guestbook:
//   POSTs are only accepted from our own origin, rate-limited per IP, and
//   require passing through the honeypot + length validators. An attacker
//   who bypasses client gating can still only submit at the guestbook rate
//   and their submission still requires Dhruv's manual approval to appear.

import { NextRequest } from 'next/server';
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

// ─── POST /api/matrix-notes — new entry submission ──────────────────────
export async function POST(request: NextRequest) {
  try {
    const originError = validateOrigin(request);
    if (originError) return originError;

    const ip = getClientIP(request);

    const { limited, retryAfter } = matrixNotesRateLimiter.check(ip);
    if (limited) {
      return Response.json(
        { error: `Whoa, let the matrix catch up. Try again in ${retryAfter}s.` },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }

    const body: SubmissionBody = await request.json().catch(() => ({}));

    // Honeypot — non-empty `website` → silent success (bot signature).
    if (asString(body.website).trim().length > 0) {
      return Response.json({ success: true });
    }

    // Validate message. Same shape + limits as the guestbook.
    const message = asString(body.message)
      .trim()
      .slice(0, GUESTBOOK_LIMITS.maxMessageLength);
    if (!message || message.length < 5) {
      return Response.json(
        { error: 'Message must be at least 5 characters.' },
        { status: 400 },
      );
    }
    if (message.length > GUESTBOOK_LIMITS.maxMessageLength) {
      return Response.json({ error: 'Message too long.' }, { status: 400 });
    }
    if (URL_PATTERN.test(message)) {
      return Response.json(
        { error: 'Links are not allowed in matrix notes.' },
        { status: 400 },
      );
    }

    // Validate name.
    const rawName = asString(body.name)
      .trim()
      .slice(0, GUESTBOOK_LIMITS.maxNameLength);
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
// fetches this client-side AFTER confirming the user is unlocked — we
// never render the wall HTML on the server so locked users can't view
// source to find the route.
//
// Cache: no-store. The wall is low-traffic and the moderator-approved
// surface should always be fresh. Cloudflare will still honor the
// Cache-Control header for intermediate caches if we ever add one.
export async function GET() {
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
