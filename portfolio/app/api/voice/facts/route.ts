import { NextRequest } from 'next/server';
import { BoundedJsonError, getBoundedJsonErrorMessage, readBoundedJson } from '@/lib/boundedJson.server';
import { getRelevantFactContext } from '@/lib/factRetrieval.server';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { VOICE_FACTS_LIMIT } from '@/lib/voiceAgentConfig';
import { validateOrigin } from '@/lib/validateOrigin';

export const runtime = 'nodejs';

const limiter = createServerRateLimiter({
  maxRequests: 20,
  windowMs: 300_000,
  maxTrackedIPs: 300,
  cleanupInterval: 40,
});

interface FactsBody {
  query?: unknown;
}

export async function POST(request: NextRequest) {
  const originError = validateOrigin(request, { requireOrigin: true });
  if (originError) return originError;

  const { limited, retryAfter } = limiter.check(getClientIP(request));
  if (limited) {
    return Response.json(
      { error: `Fact lookup is cooling down. Try again in ${retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let body: FactsBody;
  try {
    body = await readBoundedJson<FactsBody>(request, 2_048);
  } catch (error) {
    if (error instanceof BoundedJsonError) {
      return Response.json({ error: getBoundedJsonErrorMessage(error) }, { status: error.status });
    }
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query || query.length > 240) {
    return Response.json({ error: 'A short query is required.' }, { status: 400 });
  }

  const facts = await getRelevantFactContext(query, { limit: VOICE_FACTS_LIMIT });
  return Response.json({
    ok: true,
    spokenText: facts || 'I have the sketchbook open — let me grab the project note.',
    data: { facts },
  });
}
