import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const localTtsMocks = vi.hoisted(() => ({
  assertQueueAvailable: vi.fn(async () => undefined),
  getQueueState: vi.fn(() => ({ active: 0, queued: 0 })),
  getSettings: vi.fn(() => ({
    cacheMode: 'cache-first',
    concurrency: 1,
    defaultSpeed: 1,
    defaultVoice: 'custom-dhruv',
    modelId: 'kyutai/pocket-tts',
    provider: 'pocket-tts',
    sampleRate: 24_000,
  })),
  getVoiceRevision: vi.fn(async () => 'a'.repeat(64)),
  resolveOptions: vi.fn(),
  runWithSlot: vi.fn(),
  splitText: vi.fn(),
  streamCached: vi.fn(),
  synthesizeCached: vi.fn(),
}));

vi.mock('@/lib/localTts.server', () => ({
  assertLocalTtsQueueAvailable: localTtsMocks.assertQueueAvailable,
  getLocalTtsQueueState: localTtsMocks.getQueueState,
  getLocalTtsVoiceRevision: localTtsMocks.getVoiceRevision,
  getPublicLocalTtsSettings: localTtsMocks.getSettings,
  isTtsQueueFullError: (error: unknown) => error instanceof Error && error.name === 'TtsQueueFullError',
  isTtsRequestAbortedError: () => false,
  resolveLocalTtsOptions: localTtsMocks.resolveOptions,
  runWithLocalTtsSlot: localTtsMocks.runWithSlot,
  splitTextForLocalTts: localTtsMocks.splitText,
  streamLocalTtsCached: localTtsMocks.streamCached,
  synthesizeLocalTtsCached: localTtsMocks.synthesizeCached,
}));

import { GET, POST } from '@/app/api/tts/route';
import { POST as POSTVoiceLog } from '@/app/api/log/voice/route';

describe('/api/tts security', () => {
  const originalTtsNodeMode = process.env.TTS_NODE_MODE;

  beforeEach(() => {
    vi.clearAllMocks();
    localTtsMocks.resolveOptions.mockReturnValue({ speed: 1, voice: 'custom-dhruv' });
    localTtsMocks.splitText.mockImplementation((text: string) => [text]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    if (originalTtsNodeMode === undefined) {
      delete process.env.TTS_NODE_MODE;
    } else {
      process.env.TTS_NODE_MODE = originalTtsNodeMode;
    }
  });

  it('rejects headerless GET status requests before loading the model', async () => {
    const response = await GET(new Request('http://localhost/api/tts') as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('allows same-origin browser status requests without an Origin header', async () => {
    const response = await GET(new Request('http://localhost/api/tts', {
      headers: {
        'sec-fetch-site': 'same-origin',
        'x-forwarded-for': 'tts-status-test',
      },
    }) as never);

    expect(response.status).toBe(200);
  });

  it('returns sanitized status settings for allowed explicit-origin GET requests', async () => {
    const response = await GET(new Request('http://localhost/api/tts', {
      headers: {
        origin: 'https://whoisdhruv.com',
        'x-forwarded-for': 'tts-status-test',
      },
    }) as never);

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok: boolean;
      queue: { active: number; queued: number };
      settings: Record<string, unknown>;
      voiceRevision: string;
    };

    expect(payload.ok).toBe(true);
    expect(payload.queue).toEqual({ active: 0, queued: 0 });
    expect(payload.settings).toMatchObject({
      cacheMode: 'cache-first',
      concurrency: 1,
      defaultSpeed: 1,
      defaultVoice: 'custom-dhruv',
      modelId: 'kyutai/pocket-tts',
      provider: 'pocket-tts',
      sampleRate: 24_000,
    });
    expect(payload.settings).not.toHaveProperty('cacheDir');
    expect(payload.settings).not.toHaveProperty('espeakLibrary');
    expect(payload.settings).not.toHaveProperty('pythonExecutable');
    expect(payload.settings).not.toHaveProperty('quantized');
    expect(payload.settings).not.toHaveProperty('workerScript');
    expect(payload.voiceRevision).toMatch(/^[a-f0-9]{64}$/);
  });

  it('checks POST origin before body validation or model loading', async () => {
    const rejected = await POST(new Request('http://localhost/api/tts', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-origin' },
    }) as never);
    expect(rejected.status).toBe(403);

    const allowed = await POST(new Request('http://localhost/api/tts', {
      method: 'POST',
      headers: { origin: 'https://whoisdhruv.com' },
    }) as never);
    expect(allowed.status).toBe(411);
  });

  it('fails closed without local metadata or synthesis behavior on remote nodes', async () => {
    process.env.TTS_NODE_MODE = 'remote';
    for (const operation of Object.values(localTtsMocks)) operation.mockClear();

    const statusResponse = await GET(new Request('http://localhost/api/tts', {
      headers: { 'sec-fetch-site': 'same-origin' },
    }) as never);
    expect(statusResponse.status).toBe(503);
    expect(statusResponse.headers.get('cache-control')).toBe('no-store');
    await expect(statusResponse.json()).resolves.toEqual({ error: 'Local TTS is disabled on this node.' });

    const synthesisResponse = await POST(new Request('http://localhost/api/tts', {
      body: JSON.stringify({ text: 'This must not reach the local worker.' }),
      method: 'POST',
      headers: {
        'content-length': '52',
        'content-type': 'application/json',
        origin: 'https://whoisdhruv.com',
      },
    }) as never);
    expect(synthesisResponse.status).toBe(503);
    expect(synthesisResponse.headers.get('cache-control')).toBe('no-store');
    for (const operation of Object.values(localTtsMocks)) expect(operation).not.toHaveBeenCalled();
  });

  function ttsRequest(body: object, signal?: AbortSignal) {
    const payload = JSON.stringify(body);
    return new Request('http://localhost/api/tts', {
      method: 'POST', body: payload, signal,
      headers: {
        origin: 'https://whoisdhruv.com',
        'content-length': String(Buffer.byteLength(payload)),
        'x-forwarded-for': 'tts-stream-test',
      },
    });
  }

  it('returns 429 with Retry-After before opening a queue-full NDJSON stream', async () => {
    const error = new Error('Local TTS queue is full. Try again in a moment.');
    error.name = 'TtsQueueFullError';
    localTtsMocks.assertQueueAvailable.mockRejectedValueOnce(error);
    const response = await POST(ttsRequest({ text: 'full queue', stream: true }) as never);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('2');
    await expect(response.json()).resolves.toEqual({ error: error.message });
    expect(localTtsMocks.streamCached).not.toHaveBeenCalled();
  });

  it('aborts the synthesis subscriber when its NDJSON response reader is canceled', async () => {
    const aborted = vi.fn();
    let subscriberSignal: AbortSignal | undefined;
    localTtsMocks.streamCached.mockImplementationOnce(async function* (_text, _options, signal: AbortSignal) {
      subscriberSignal = signal;
      yield {
        audio: Buffer.from([0, 0]), durationMs: 1, index: 0,
        sampleRate: 24_000, text: 'cancel stream', voiceRevision: 'a'.repeat(64),
      };
      await new Promise<void>((_resolve, reject) => {
        const onAbort = () => { aborted(); reject(new Error('aborted')); };
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      });
    });
    const request = ttsRequest({ text: 'cancel stream', stream: true });
    const response = await POST(request as never);
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    await vi.waitFor(() => expect(aborted).toHaveBeenCalledOnce());
    expect(subscriberSignal?.aborted).toBe(true);
    expect(request.signal.aborted).toBe(false);
  });

  it.each([
    ['TTS', POST, 6_000],
    ['voice log', POSTVoiceLog, 2_048],
  ] as const)('counts actual bytes for %s despite a forged small Content-Length', async (_name, post, limit) => {
    vi.stubEnv('LOG_RAW', 'true');
    const response = await post(new Request('http://localhost/api/tts', {
      method: 'POST', body: JSON.stringify({ text: 'x'.repeat(limit) }),
      headers: { origin: 'https://whoisdhruv.com', 'content-length': '1' },
    }) as never);
    expect(response.status).toBe(413);
    expect(localTtsMocks.synthesizeCached).not.toHaveBeenCalled();
  });

  it.each(['null', '[]', 'not json'])('rejects invalid object bodies (%s) before synthesis or logging', async (body) => {
    vi.stubEnv('LOG_RAW', 'true');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    for (const post of [POST, POSTVoiceLog]) {
      const response = await post(new Request('http://localhost/api/tts', {
        method: 'POST', body,
        headers: { origin: 'https://whoisdhruv.com', 'content-length': String(body.length) },
      }) as never);
      expect(response.status).toBe(400);
    }
    expect(log).not.toHaveBeenCalled();
    expect(localTtsMocks.synthesizeCached).not.toHaveBeenCalled();
  });

  it('does not read voice log bodies when logging is disabled', async () => {
    vi.stubEnv('LOG_RAW', 'false');
    const request = new Request('http://localhost/api/log/voice', { method: 'POST', body: 'not json' });
    const response = await POSTVoiceLog(request as never);
    expect(response.status).toBe(204);
    expect(request.bodyUsed).toBe(false);
  });

});
