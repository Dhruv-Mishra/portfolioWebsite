import { describe, expect, it } from 'vitest';

import { GET } from '@/app/api/tts/route';

describe('/api/tts security', () => {
  it('rejects headerless GET status requests before loading the model', async () => {
    const response = await GET(new Request('http://localhost/api/tts') as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns sanitized status settings for same-origin GET requests', async () => {
    const response = await GET(new Request('http://localhost/api/tts', {
      headers: {
        'sec-fetch-site': 'same-origin',
        'x-forwarded-for': 'tts-status-test',
      },
    }) as never);

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok: boolean;
      queue: { active: number; queued: number };
      settings: Record<string, unknown>;
    };

    expect(payload.ok).toBe(true);
    expect(payload.queue).toEqual({ active: 0, queued: 0 });
    expect(payload.settings).toMatchObject({
      cacheMode: 'cache-first',
      chunkChars: 120,
      concurrency: 1,
      defaultSpeed: 1.08,
      defaultVoice: 'expr-voice-5-m',
      modelId: 'KittenML/kitten-tts-nano-0.1',
      provider: 'kitten-tts',
      sampleRate: 24_000,
    });
    expect(payload.settings).not.toHaveProperty('cacheDir');
    expect(payload.settings).not.toHaveProperty('espeakLibrary');
    expect(payload.settings).not.toHaveProperty('pythonExecutable');
    expect(payload.settings).not.toHaveProperty('workerScript');
  });
});
