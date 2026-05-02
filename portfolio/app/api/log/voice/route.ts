import { NextResponse } from 'next/server';

/**
 * Server-side voice diagnostics sink. Active only when `LOG_RAW=true`
 * to avoid noisy production logs. Accepts beacons from the client whisper
 * pipeline (model load lifecycle + transcription timings).
 */
export const runtime = 'nodejs';

interface VoiceLogPayload {
  event?: string;
  detail?: unknown;
}

export async function POST(req: Request): Promise<Response> {
  if (process.env.LOG_RAW !== 'true') {
    return new NextResponse(null, { status: 204 });
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
