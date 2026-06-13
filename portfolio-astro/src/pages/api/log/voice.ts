import type { APIRoute } from 'astro';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { validateOrigin } from '@/lib/validateOrigin';

export const prerender = false;

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

export const POST: APIRoute = async ({ request }) => {
  if (process.env.LOG_RAW !== 'true') {
    return new Response(null, { status: 204 });
  }

  const originError = validateOrigin(request, { requireOrigin: true });
  if (originError) return originError;

  const ip = getClientIP(request);
  const { limited, retryAfter } = voiceLogRateLimiter.check(ip);
  if (limited) {
    return new Response(null, {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    });
  }

  const contentLength = Number(request.headers.get('content-length'));
  if (!Number.isFinite(contentLength) || contentLength > MAX_VOICE_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  let payload: VoiceLogPayload = {};
  try {
    payload = await request.json() as VoiceLogPayload;
  } catch {
    // Ignore malformed beacons.
  }

  const event = typeof payload.event === 'string' ? payload.event : 'unknown';
  console.log(`[voice] ${event}`, payload.detail ?? '');
  return new Response(null, { status: 204 });
};