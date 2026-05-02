import { NextRequest, NextResponse } from 'next/server';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { validateOrigin } from '@/lib/validateOrigin';

/**
 * Server-side voice diagnostics sink. Active only when `LOG_RAW=true`
 * to avoid noisy production logs. Accepts beacons from the client whisper
 * pipeline (model load lifecycle + transcription timings).
 *
 * Hardening:
 * - Short-circuits BEFORE parsing the body when LOG_RAW is unset, so an
 *   attacker cannot pump arbitrary JSON through this endpoint just because
 *   the diagnostic flag exists in code.
 * - validateOrigin (strict) blocks cross-origin and header-less callers.
 * - 2KB content-length cap prevents log-flood payloads when the flag IS on.
 * - Per-IP rate limit caps beacon frequency so even an authorized attacker
 *   with the flag enabled cannot spam server logs.
 */
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
  // Short-circuit BEFORE any parsing. When the diagnostic flag is off, the
  // endpoint is effectively disabled and accepts no payload.
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

  const contentLength = Number(req.headers.get('content-length'));
  if (!Number.isFinite(contentLength) || contentLength > MAX_VOICE_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let payload: VoiceLogPayload = {};
  try {
    payload = (await req.json()) as VoiceLogPayload;
  } catch {
    /* ignore malformed beacon */
  }
  const event = typeof payload.event === 'string' ? payload.event : 'unknown';
  console.log(`[voice] ${event}`, payload.detail ?? '');
  return new NextResponse(null, { status: 204 });
}
