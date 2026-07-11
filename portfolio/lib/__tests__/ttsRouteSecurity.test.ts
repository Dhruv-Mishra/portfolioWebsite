import { afterEach, describe, expect, it, vi } from 'vitest';

const localTtsMocks = vi.hoisted(() => ({
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
  stream: vi.fn(),
  synthesize: vi.fn(),
}));

vi.mock('@/lib/localTts.server', () => ({
  getLocalTtsQueueState: localTtsMocks.getQueueState,
  getLocalTtsVoiceRevision: localTtsMocks.getVoiceRevision,
  getPublicLocalTtsSettings: localTtsMocks.getSettings,
  isTtsQueueFullError: () => false,
  isTtsRequestAbortedError: () => false,
  resolveLocalTtsOptions: localTtsMocks.resolveOptions,
  runWithLocalTtsSlot: localTtsMocks.runWithSlot,
  splitTextForLocalTts: localTtsMocks.splitText,
  streamLocalTts: localTtsMocks.stream,
  synthesizeLocalTts: localTtsMocks.synthesize,
}));

import { GET, POST } from '@/app/api/tts/route';

describe('/api/tts security', () => {
  const originalTtsNodeMode = process.env.TTS_NODE_MODE;

  afterEach(() => {
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
});
