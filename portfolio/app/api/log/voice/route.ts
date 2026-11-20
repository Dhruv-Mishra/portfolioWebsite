import { NextRequest, NextResponse } from 'next/server';
import { readJsonObjectOrError } from '@/lib/boundedJson.server';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { validateOrigin } from '@/lib/validateOrigin';

export const runtime = 'nodejs';

interface VoiceLogPayload {
  event?: string;
  detail?: unknown;
}

const MAX_VOICE_BODY_BYTES = 2_048;
const voiceLogRateLimiter = createServerRateLimiter({
  maxRequests: 60,
  windowMs: 60_000,
  maxTrackedIPs: 256,
  cleanupInterval: 32,
});

export async function POST(req: NextRequest): Promise<Response> {
  // Disabled unless LOG_RAW is set: return before reading any body.
  if (process.env.LOG_RAW !== 'true') {
    return new NextResponse(null, { status: 204 });
  }

  const originError = validateOrigin(req, { requireOrigin: true });
  if (originError) return originError;

  const ip = getClientIP(req);
  const { limited, retryAfter } = voiceLogRateLimiter.check(ip);
  if (limited) {
    return new NextResponse(null, {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    });
  }

  const payload = await readJsonObjectOrError<VoiceLogPayload>(req, MAX_VOICE_BODY_BYTES);
  if (payload instanceof Response) return payload;
  const event = typeof payload.event === 'string' ? payload.event : 'unknown';
  console.log(`[voice] ${event}`, payload.detail ?? '');
  return new NextResponse(null, { status: 204 });
}
