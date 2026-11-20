import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetTtsUtteranceCacheForTests,
  buildTtsUtteranceCacheKey,
  getTtsUtteranceCacheKey,
  readTtsUtteranceCache,
  rememberTtsUtterance,
} from '@/lib/localTts.server';

const options = { speed: 1, voice: 'custom-dhruv' } as const;
const voiceRevision = 'a'.repeat(64);

describe('local TTS utterance cache', () => {
  let cacheDir = '';

  beforeEach(async () => {
    __resetTtsUtteranceCacheForTests();
    cacheDir = await mkdtemp(path.join(os.tmpdir(), 'tts-utterance-cache-'));
    vi.stubEnv('LOCAL_TTS_CACHE_DIR', cacheDir);
  });

  afterEach(async () => {
    __resetTtsUtteranceCacheForTests();
    vi.unstubAllEnvs();
    if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
  });

  it('builds a stable v9 pocket-tts key independent of ignored speed', () => {
    const key = getTtsUtteranceCacheKey('Hello there', options, voiceRevision);

    expect(key).toBe(buildTtsUtteranceCacheKey('Hello there', options, voiceRevision));
    expect(key).toMatch(/^tts:v9:pocket-tts:[a-f0-9]{64}:custom-dhruv:[a-f0-9]{64}:pcm_s16le:24000$/);
    expect(getTtsUtteranceCacheKey('Hello there.', options, voiceRevision)).not.toBe(key);
    expect(getTtsUtteranceCacheKey('Hello there', { ...options, speed: 1.08 }, voiceRevision)).toBe(key);
  });

  it('reads back a written PCM utterance', async () => {
    const key = getTtsUtteranceCacheKey('cached hello', options, voiceRevision);
    const pcm = Buffer.from([0, 32, 0, 224]);

    await rememberTtsUtterance(key, pcm, {
      durationMs: 1,
      sampleRate: 24_000,
      voiceRevision,
    });

    await expect(readTtsUtteranceCache(key)).resolves.toEqual({
      durationMs: 1,
      pcm,
      sampleRate: 24_000,
      voiceRevision,
    });
  });

  it('rejects a cache file whose meta does not match the key', async () => {
    const key = getTtsUtteranceCacheKey('meta mismatch', options, voiceRevision);
    const pcm = Buffer.from([0, 32, 0, 224]);
    await rememberTtsUtterance(key, pcm, {
      durationMs: 1,
      sampleRate: 24_000,
      voiceRevision,
    });

    const digest = createHash('sha256').update(key).digest('hex');
    await writeFile(path.join(cacheDir, 'utterances', `${digest}.meta.json`), JSON.stringify({
      byteLength: pcm.byteLength,
      createdAt: Date.now(),
      durationMs: 1,
      key,
      sampleRate: 48_000,
      voiceRevision,
    }));

    await expect(readTtsUtteranceCache(key)).resolves.toBeNull();
  });

});
