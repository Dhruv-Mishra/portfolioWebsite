/**
 * POST /api/admin/unlock
 *
 * Accepts `{ username, password }` from the terminal's `sudo admin` login
 * sequence. If credentials match the puzzle's known values, mints an
 * HMAC-signed token and returns it — both as an httpOnly cookie AND in
 * the JSON body so the terminal can mirror it into sessionStorage.
 *
 * This is intentionally a "puzzle" gate, not a real auth system — the
 * username + password are hardcoded client-visible puzzle content. The
 * token just ensures /admin can't be opened by editing localStorage.
 */

import { NextRequest } from 'next/server';
import { ADMIN_COOKIE_NAME, issueAdminToken } from '@/lib/adminAuth.server';
import { ADMIN_PASSWORD, ADMIN_USERNAME } from '@/lib/matrixPuzzle';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { validateOrigin } from '@/lib/validateOrigin';

export const runtime = 'nodejs';

const adminRateLimiter = createServerRateLimiter({
  maxRequests: 12,
  windowMs: 5 * 60_000,
  maxTrackedIPs: 256,
  cleanupInterval: 32,
});

const TOKEN_MAX_AGE_SECONDS = 8 * 60 * 60; // 8h matches adminAuth.server.ts window

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still run a constant-time compare on a fixed-length buffer so timing
    // attacks can't distinguish "length mismatch" from "content mismatch".
    const pad = b.padEnd(a.length, '\0').slice(0, a.length);
    let diff = 1;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ pad.charCodeAt(i);
    }
    return diff === 0;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: NextRequest): Promise<Response> {
  const originError = validateOrigin(request);
  if (originError) return originError;

  const ip = getClientIP(request);
  const { limited, retryAfter } = adminRateLimiter.check(ip);
  if (limited) {
    return Response.json(
      { error: `Too many attempts. Try again in ${retryAfter} seconds.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const username = typeof body.username === 'string' ? body.username : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password || username.length > 64 || password.length > 128) {
    return Response.json({ error: 'Invalid credentials' }, { status: 400 });
  }

  const userOk = timingSafeStringEqual(username, ADMIN_USERNAME);
  const passOk = timingSafeStringEqual(password, ADMIN_PASSWORD);
  if (!userOk || !passOk) {
    return Response.json({ error: 'Authentication failure' }, { status: 401 });
  }

  const token = issueAdminToken();

  return new Response(
    JSON.stringify({ ok: true, token }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Set-Cookie': [
          `${ADMIN_COOKIE_NAME}=${token}`,
          'Path=/',
          `Max-Age=${TOKEN_MAX_AGE_SECONDS}`,
          'HttpOnly',
          'SameSite=Lax',
          // Secure flag only in production; omitted in dev so http://localhost works.
          process.env.NODE_ENV === 'production' ? 'Secure' : '',
        ].filter(Boolean).join('; '),
      },
    },
  );
}
