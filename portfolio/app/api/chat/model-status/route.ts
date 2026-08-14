import { NextRequest } from 'next/server';
import { getKnownLocalAgentStatus, getLocalAgentStatus } from '@/lib/localAgentStatus.server';
import { getChatModelRuntimeCatalog } from '@/lib/llmProviders.server';
import { getModelHealthAdvisory } from '@/lib/modelHealth.server';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { validateOrigin } from '@/lib/validateOrigin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const modelStatusRateLimiter = createServerRateLimiter({
  maxRequests: 60,
  windowMs: 60_000,
  maxTrackedIPs: 256,
  cleanupInterval: 32,
});

export async function GET(request: NextRequest): Promise<Response> {
  const originError = validateOrigin(request);
  if (originError) return originError;

  const { limited, retryAfter } = modelStatusRateLimiter.check(getClientIP(request));
  if (limited) {
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const fresh = new URL(request.url).searchParams.get('fresh') === '1';
  const localModelStatus = fresh
    ? await getLocalAgentStatus({ force: true })
    : getKnownLocalAgentStatus();

  return Response.json({
    ...getChatModelRuntimeCatalog(),
    localModelStatus,
    advisoryHealth: await getModelHealthAdvisory(),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}