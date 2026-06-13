import type { APIRoute } from 'astro';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { validateOrigin } from '@/lib/validateOrigin';
import { createPendingNoteIssue, getApprovedNotes, resolveNotesRepo, resolveNotesToken } from '@/lib/notes.server';
import { GUESTBOOK_LIMITS } from '@/lib/designTokens';
import type { GuestbookEntry } from '@/lib/guestbook';
import { MATRIX_FILLER_NOTES } from '@/lib/matrixFillerNotes';

export const prerender = false;

const matrixNotesRateLimiter = createServerRateLimiter({
  maxRequests: 3,
  windowMs: 600_000,
  maxTrackedIPs: 200,
  cleanupInterval: 30,
});
const MAX_MATRIX_NOTES_BODY_BYTES = 4_000;

const URL_PATTERN = /(?:https?:\/\/|www\.)/i;

interface SubmissionBody {
  message?: unknown;
  name?: unknown;
  website?: unknown;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export const POST: APIRoute = async ({ request }) => {
  try {
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

    const contentLength = Number(request.headers.get('content-length'));
    if (!Number.isFinite(contentLength)) {
      return Response.json({ error: 'Content-Length header required' }, { status: 411 });
    }
    if (contentLength > MAX_MATRIX_NOTES_BODY_BYTES) {
      return Response.json({ error: 'Request body is too large' }, { status: 413 });
    }

    const body = await request.json().catch(() => ({})) as SubmissionBody;
    if (asString(body.website).trim().length > 0) return Response.json({ success: true });

    const message = asString(body.message).trim().slice(0, GUESTBOOK_LIMITS.maxMessageLength);
    if (!message || message.length < 5) return Response.json({ error: 'Message must be at least 5 characters.' }, { status: 400 });
    if (message.length > GUESTBOOK_LIMITS.maxMessageLength) return Response.json({ error: 'Message too long.' }, { status: 400 });
    if (URL_PATTERN.test(message)) return Response.json({ error: 'Links are not allowed in matrix notes.' }, { status: 400 });

    const rawName = asString(body.name).trim().slice(0, GUESTBOOK_LIMITS.maxNameLength);
    const name = rawName.replace(/\r?\n/g, ' ').replace(/^@+/, '').trim();
    if (name && URL_PATTERN.test(name)) return Response.json({ error: 'Links are not allowed in matrix notes.' }, { status: 400 });

    if (!resolveNotesRepo('matrix') || !resolveNotesToken('matrix')) {
      console.error('[matrix-notes] Missing GITHUB_MATRIX_NOTES_TOKEN/REPO (or fallback GUESTBOOK/FEEDBACK_*) env vars');
      return Response.json({ error: 'Matrix notes not configured' }, { status: 500 });
    }

    try {
      await createPendingNoteIssue({ kind: 'matrix', message, name, ip });
    } catch (error) {
      console.error('[matrix-notes] createPendingNoteIssue failed:', error);
      return Response.json({ error: 'The transmission glitched - try again.' }, { status: 502 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[matrix-notes] POST error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
};

export const GET: APIRoute = async () => {
  const repo = resolveNotesRepo('matrix');
  const token = resolveNotesToken('matrix');
  if (!repo || !token) return Response.json({ entries: [...MATRIX_FILLER_NOTES] } satisfies { entries: GuestbookEntry[] });

  const approved = await getApprovedNotes('matrix');
  const entries = [...approved, ...MATRIX_FILLER_NOTES].sort((a, b) => {
    const firstTime = new Date(a.createdAt).getTime();
    const secondTime = new Date(b.createdAt).getTime();
    return secondTime - firstTime;
  });

  return Response.json({ entries } satisfies { entries: GuestbookEntry[] }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
};