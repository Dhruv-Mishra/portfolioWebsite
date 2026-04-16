// app/api/guestbook/route.ts — Guestbook submission + listing API.
//
// POST creates a `guestbook-pending` GitHub issue for Dhruv to review.
// GET lists `guestbook-approved` entries for client-side fetch (the wall page SSRs via
// `getApprovedEntries()` directly, but this endpoint exists for future use / revalidation).

import { NextRequest } from 'next/server';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { GITHUB_API_VERSION, GITHUB_API_TIMEOUT_MS } from '@/lib/llmConfig';
import { validateOrigin } from '@/lib/validateOrigin';
import {
  createPendingIssue,
  resolveGuestbookRepo,
  resolveGuestbookToken,
} from '@/lib/guestbook.server';
import { parseIssueBody, type GuestbookEntry } from '@/lib/guestbook';
import { GUESTBOOK_LIMITS } from '@/lib/designTokens';

export const runtime = 'nodejs';

// ─── Rate limiter: 3 submissions per 10 min per IP ──────────────────────
const guestbookRateLimiter = createServerRateLimiter({
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

// ─── POST /api/guestbook — new entry submission ─────────────────────────
export async function POST(request: NextRequest) {
  try {
    const originError = validateOrigin(request);
    if (originError) return originError;

    const ip = getClientIP(request);

    const { limited, retryAfter } = guestbookRateLimiter.check(ip);
    if (limited) {
      return Response.json(
        { error: `Whoa, let Dhruv catch up. Try again in ${retryAfter}s.` },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }

    const body: SubmissionBody = await request.json().catch(() => ({}));

    // Honeypot — non-empty `website` → silent success (bot signature).
    if (asString(body.website).trim().length > 0) {
      return Response.json({ success: true });
    }

    // Validate message.
    const message = asString(body.message).trim().slice(0, GUESTBOOK_LIMITS.maxMessageLength);
    if (!message || message.length < 5) {
      return Response.json({ error: 'Message must be at least 5 characters.' }, { status: 400 });
    }
    if (message.length > GUESTBOOK_LIMITS.maxMessageLength) {
      return Response.json({ error: 'Message too long.' }, { status: 400 });
    }
    if (URL_PATTERN.test(message)) {
      return Response.json({ error: 'Links are not allowed in guestbook entries.' }, { status: 400 });
    }

    // Validate name.
    const rawName = asString(body.name).trim().slice(0, GUESTBOOK_LIMITS.maxNameLength);
    const name = rawName.replace(/\r?\n/g, ' ').replace(/^@+/, '').trim();
    if (name && URL_PATTERN.test(name)) {
      return Response.json({ error: 'Links are not allowed in guestbook entries.' }, { status: 400 });
    }

    // Ensure env is configured before hitting GitHub.
    if (!resolveGuestbookRepo() || !resolveGuestbookToken()) {
      console.error('[guestbook] Missing GITHUB_GUESTBOOK_TOKEN/REPO (or fallback FEEDBACK_*) env vars');
      return Response.json({ error: 'Guestbook not configured' }, { status: 500 });
    }

    try {
      await createPendingIssue({ message, name, ip });
    } catch (err) {
      console.error('[guestbook] createPendingIssue failed:', err);
      return Response.json(
        { error: 'The pin fell out — try again.' },
        { status: 502 },
      );
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('[guestbook] POST error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── GET /api/guestbook — list approved entries ─────────────────────────
interface GitHubIssueSummary {
  number: number;
  body: string | null;
  created_at: string;
}

const LIST_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600',
  'CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
};

export async function GET() {
  const repo = resolveGuestbookRepo();
  const token = resolveGuestbookToken();
  if (!repo || !token) {
    return Response.json(
      { error: 'Guestbook not configured' },
      { status: 500 },
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GITHUB_API_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/issues?labels=guestbook-approved&state=open&per_page=50&sort=created&direction=desc`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
        },
        signal: controller.signal,
        cache: 'no-store',
      },
    );

    if (!res.ok) {
      console.error(`[guestbook] GitHub list failed (${res.status})`);
      return Response.json(
        { error: 'Failed to load guestbook entries.' },
        { status: 502 },
      );
    }

    const issues = (await res.json()) as GitHubIssueSummary[];
    const entries: GuestbookEntry[] = issues.map((issue) => {
      const { message, name } = parseIssueBody(issue.body ?? '');
      return {
        id: issue.number,
        message,
        name,
        createdAt: issue.created_at,
      };
    });

    return Response.json({ entries }, { headers: LIST_CACHE_HEADERS });
  } catch (err) {
    console.error('[guestbook] GET error:', err);
    return Response.json(
      { error: 'Failed to load guestbook entries.' },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
