import { NextRequest, NextResponse } from 'next/server';
import {
  encodePcm16,
  getLocalTtsQueueState,
  getLocalTtsSettings,
  isTtsRequestAbortedError,
  isTtsQueueFullError,
  preloadLocalTts,
  resolveLocalTtsOptions,
  runWithLocalTtsSlot,
  splitTextForLocalTts,
  streamLocalTts,
  synthesizeLocalTts,
} from '@/lib/localTts.server';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { validateOrigin } from '@/lib/validateOrigin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TTS_BODY_BYTES = 6_000;
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

export async function GET(): Promise<Response> {
  try {
    await preloadLocalTts();
    return Response.json({
      ok: true,
      queue: getLocalTtsQueueState(),
      settings: getLocalTtsSettings(),
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

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return Response.json({ error: 'Text is required' }, { status: 400 });
  }

  const options = resolveLocalTtsOptions(body);
  const chunks = splitTextForLocalTts(text);
  if (chunks.length === 0) {
    return Response.json({ error: 'Text is empty after normalization' }, { status: 400 });
  }

  if (wantsStreaming(request, body)) {
    const encodeLine = getJsonLineEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          await runWithLocalTtsSlot(async () => {
            controller.enqueue(encodeLine({
              chunkCount: chunks.length,
              codec: 'pcm_s16le',
              sampleRate: 24_000,
              type: 'ready',
            }));

            for await (const chunk of streamLocalTts(text, options, request.signal)) {
              controller.enqueue(encodeLine({
                audioBase64: encodePcm16(chunk.audio).toString('base64'),
                durationMs: chunk.durationMs,
                index: chunk.index,
                sampleRate: chunk.sampleRate,
                text: chunk.text,
                type: 'chunk',
              }));
            }

            controller.enqueue(encodeLine({ type: 'done' }));
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
          controller.enqueue(encodeLine({ message, type: 'error' }));
        } finally {
          controller.close();
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
