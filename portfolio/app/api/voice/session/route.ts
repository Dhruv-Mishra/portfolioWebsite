import { NextRequest } from 'next/server';
import { BoundedJsonError, getBoundedJsonErrorMessage, readBoundedJson } from '@/lib/boundedJson.server';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { parseVoiceSessionRequest } from '@/lib/voiceAgentProtocol';
import { mintVoiceSession } from '@/lib/voiceSession.server';
import { parseVoiceClientSnapshot } from '@/lib/voiceClientSnapshot';
import { validateOrigin } from '@/lib/validateOrigin';

export const runtime = 'nodejs';

const limiter = createServerRateLimiter({
  maxRequests: 8,
  windowMs: 300_000,
  maxTrackedIPs: 300,
  cleanupInterval: 40,
});

interface SessionBody {
  lowNetwork?: unknown;
  snapshot?: unknown;
}

export async function POST(request: NextRequest) {
  const originError = validateOrigin(request, { requireOrigin: true });
  if (originError) return originError;

  const { limited, retryAfter } = limiter.check(getClientIP(request));
  if (limited) {
    return Response.json(
      { error: `Voice session is warming up. Try again in ${retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let body: SessionBody;
  try {
    body = await readBoundedJson<SessionBody>(request, 2_048);
  } catch (error) {
    if (error instanceof BoundedJsonError) {
      return Response.json({ error: getBoundedJsonErrorMessage(error) }, { status: error.status });
    }
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseVoiceSessionRequest(body);

  try {
    const session = await mintVoiceSession({
      snapshot: parseVoiceClientSnapshot(body?.snapshot),
      lowNetwork: parsed.lowNetwork,
    });
    return Response.json(session);
  } catch (error) {
    console.error('[voice-session] mint failed', error);
    return Response.json(
      { error: 'Unable to start voice session.', code: 'mint-failed' },
      { status: 503 },
    );
  }
}
