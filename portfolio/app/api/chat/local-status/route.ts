import { NextRequest } from 'next/server';
import { getLocalAgentStatus } from '@/lib/localAgentStatus.server';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { validateOrigin } from '@/lib/validateOrigin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNAVAILABLE_STATUS = { healthy: false, modelName: 'Local model' };

const localStatusRateLimiter = createServerRateLimiter({
  maxRequests: 60,
  windowMs: 60_000,
  maxTrackedIPs: 256,
  cleanupInterval: 32,
});

export async function GET(request: NextRequest): Promise<Response> {
  const originError = validateOrigin(request);
  if (originError) return originError;

  const { limited, retryAfter } = localStatusRateLimiter.check(getClientIP(request));
  if (limited) {
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let status = UNAVAILABLE_STATUS;

  try {
    status = await getLocalAgentStatus();
  } catch {
    // The client only needs the safe fallback when discovery is unavailable.
  }

  return Response.json(status, {
    headers: { 'Cache-Control': 'private, max-age=300' },
  });
}