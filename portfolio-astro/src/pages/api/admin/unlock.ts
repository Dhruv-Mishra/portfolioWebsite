import type { APIRoute } from 'astro';
import { ADMIN_COOKIE_NAME, issueAdminToken } from '@/lib/adminAuth.server';
import { ADMIN_PASSWORD, ADMIN_USERNAME } from '@/lib/matrixPuzzle';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { validateOrigin } from '@/lib/validateOrigin';

export const prerender = false;

const adminRateLimiter = createServerRateLimiter({
  maxRequests: 12,
  windowMs: 5 * 60_000,
  maxTrackedIPs: 256,
  cleanupInterval: 32,
});

const TOKEN_MAX_AGE_SECONDS = 8 * 60 * 60;

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    const pad = b.padEnd(a.length, '\0').slice(0, a.length);
    let diff = 1;
    for (let index = 0; index < a.length; index++) {
      diff |= a.charCodeAt(index) ^ pad.charCodeAt(index);
    }
    return diff === 0;
  }

  let diff = 0;
  for (let index = 0; index < a.length; index++) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export const POST: APIRoute = async ({ request }) => {
  const originError = validateOrigin(request, { requireOrigin: true });
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
  const failureBits = (userOk ? 0 : 1) | (passOk ? 0 : 1);
  if (failureBits !== 0) {
    return Response.json({ error: 'Authentication failure' }, { status: 401 });
  }

  const token = issueAdminToken();

  return new Response(JSON.stringify({ ok: true, token }), {
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
        process.env.NODE_ENV === 'production' ? 'Secure' : '',
      ].filter(Boolean).join('; '),
    },
  });
};