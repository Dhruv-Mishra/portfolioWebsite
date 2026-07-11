import { NextRequest, NextResponse } from 'next/server';
import { gzipSync } from 'node:zlib';
import {
  getLocalTtsQueueState,
  getPublicLocalTtsSettings,
  isTtsRequestAbortedError,
  isTtsQueueFullError,
  resolveLocalTtsOptions,
  runWithLocalTtsSlot,
  splitTextForLocalTts,
  streamLocalTts,
  synthesizeLocalTts,
} from '@/lib/localTts.server';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { adaptTextForSpeech } from '@/lib/ttsPrompts';
import { validateOrigin } from '@/lib/validateOrigin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TTS_BODY_BYTES = 6_000;
const TTS_GZIP_METADATA_OVERHEAD_BYTES = 64;
const TTS_GZIP_MINIMUM_SAVINGS_RATIO = 0.1;
const ttsRateLimiter = createServerRateLimiter({
  maxRequests: 24,
  windowMs: 60_000,
  maxTrackedIPs: 256,
  cleanupInterval: 32,
});

interface TtsRequestBody {
  speed?: unknown;
  stream?: unknown;
  text?: unknown;
  voice?: unknown;
}

export interface TtsStreamAudioFrame {
  audioBase64: string;
  compression: 'gzip' | 'none';
  uncompressedBytes?: number;
}

export function acceptsTtsFrameGzip(request: Request): boolean {
  return request.headers.get('x-tts-accept-compression') === 'gzip';
}

export function createTtsStreamAudioFrame(audio: Buffer, acceptsGzip: boolean): TtsStreamAudioFrame {
  if (!acceptsGzip) {
    return { audioBase64: audio.toString('base64'), compression: 'none' };
  }

  const compressed = gzipSync(audio, { level: 1 });
  const maximumCompressedBytes = audio.length * (1 - TTS_GZIP_MINIMUM_SAVINGS_RATIO);
  if (compressed.length + TTS_GZIP_METADATA_OVERHEAD_BYTES > maximumCompressedBytes) {
    return { audioBase64: audio.toString('base64'), compression: 'none' };
  }

  return {
    audioBase64: compressed.toString('base64'),
    compression: 'gzip',
    uncompressedBytes: audio.length,
  };
}

function getContentLength(request: NextRequest): number | null {
  const header = request.headers.get('content-length');
  if (!header) return null;

  const parsed = Number(header);
  return Number.isFinite(parsed) ? parsed : null;
}

function getJsonLineEncoder(): (payload: object) => Uint8Array {
  const encoder = new TextEncoder();
  return (payload: object) => encoder.encode(`${JSON.stringify(payload)}\n`);
}

function wantsStreaming(request: NextRequest, body: TtsRequestBody): boolean {
  if (body.stream === true) return true;
  if (request.nextUrl.searchParams.get('stream') === '1') return true;
  return request.headers.get('accept')?.includes('application/x-ndjson') ?? false;
}

function createErrorResponse(error: unknown): Response {
  if (isTtsRequestAbortedError(error)) {
    return Response.json({ error: error.message }, { status: 499 });
  }

  if (isTtsQueueFullError(error)) {
    return Response.json({ error: error.message }, { status: 429, headers: { 'Retry-After': '2' } });
  }

  console.error('[local-tts] Request failed', error);
  return Response.json({ error: 'Local TTS is unavailable right now.' }, { status: 503 });
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const body = new ArrayBuffer(buffer.length);
  new Uint8Array(body).set(buffer);
  return body;
}

export async function GET(request: NextRequest): Promise<Response> {
  const originError = validateOrigin(request, { requireOrigin: true });
  if (originError) return originError;

  const ip = getClientIP(request);
  const { limited, retryAfter } = ttsRateLimiter.check(ip);
  if (limited) {
    return Response.json(
      { error: `Rate limited. Try again in ${retryAfter} seconds.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    return Response.json({
      ok: true,
      queue: getLocalTtsQueueState(),
      settings: getPublicLocalTtsSettings(),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const originError = validateOrigin(request, { requireOrigin: true });
  if (originError) return originError;

  const ip = getClientIP(request);
  const { limited, retryAfter } = ttsRateLimiter.check(ip);
  if (limited) {
    return Response.json(
      { error: `Rate limited. Try again in ${retryAfter} seconds.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const contentLength = getContentLength(request);
  if (contentLength === null) {
    return Response.json({ error: 'Content-Length header required' }, { status: 411 });
  }
  if (contentLength > MAX_TTS_BODY_BYTES) {
    return Response.json({ error: 'Request body is too large' }, { status: 413 });
  }

  let body: TtsRequestBody;
  try {
    body = await request.json() as TtsRequestBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawText = typeof body.text === 'string' ? body.text.trim() : '';
  if (!rawText) {
    return Response.json({ error: 'Text is required' }, { status: 400 });
  }

  const text = adaptTextForSpeech(rawText);

  const options = resolveLocalTtsOptions(body);
  const chunks = splitTextForLocalTts(text);
  if (chunks.length === 0) {
    return Response.json({ error: 'Text is empty after normalization' }, { status: 400 });
  }

  if (wantsStreaming(request, body)) {
    const encodeLine = getJsonLineEncoder();
    const acceptsGzip = acceptsTtsFrameGzip(request);
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        canceled = true;
      },
      async start(controller) {
        let closed = false;
        const safeEnqueue = (payload: object): boolean => {
          if (closed || canceled || request.signal.aborted) return false;
          try {
            controller.enqueue(encodeLine(payload));
            return true;
          } catch {
            closed = true;
            return false;
          }
        };
        const safeClose = () => {
          if (closed || canceled) return;
          closed = true;
          try { controller.close(); } catch { /* The consumer already canceled. */ }
        };

        try {
          await runWithLocalTtsSlot(async () => {
            if (!safeEnqueue({
              codec: 'pcm_s16le',
              provider: getPublicLocalTtsSettings().provider,
              quantized: getPublicLocalTtsSettings().quantized,
              sampleRate: 24_000,
              compression: acceptsGzip ? 'adaptive-gzip' : 'none',
              type: 'ready',
            })) return;

            for await (const chunk of streamLocalTts(text, options, request.signal)) {
              if (!safeEnqueue({
                ...createTtsStreamAudioFrame(chunk.audio, acceptsGzip),
                durationMs: chunk.durationMs,
                index: chunk.index,
                sampleRate: chunk.sampleRate,
                type: 'chunk',
              })) return;
            }

            safeEnqueue({ type: 'done' });
          }, request.signal);
        } catch (error) {
          if (isTtsRequestAbortedError(error) || request.signal.aborted) {
            return;
          }
          const message = isTtsQueueFullError(error)
            ? error.message
            : 'Local TTS streaming failed.';
          if (!isTtsQueueFullError(error)) {
            console.error('[local-tts] Streaming request failed', error);
          }
          safeEnqueue({ message, type: 'error' });
        } finally {
          safeClose();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  try {
    const wav = await runWithLocalTtsSlot(() => synthesizeLocalTts(text, options, request.signal), request.signal);
    return new NextResponse(toArrayBuffer(wav), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Length': String(wav.length),
        'Content-Type': 'audio/wav',
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}
