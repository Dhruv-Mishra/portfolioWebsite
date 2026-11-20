import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { POST } from '@/app/api/tts/route';
import {
  __resetTtsUtteranceCacheForTests,
  assertLocalTtsQueueAvailable,
  buildTtsUtteranceCacheKey,
  getLocalTtsQueueState,
  getLocalTtsVoiceRevision,
  readTtsUtteranceCache,
  rememberTtsUtterance,
  runWithLocalTtsSlot,
  streamLocalTtsCached,
  synthesizeLocalTtsCached,
} from '@/lib/localTts.server';

const options = { speed: 1, voice: 'custom-dhruv' } as const;
const pcm = Buffer.from([0, 32, 0, 224]);

function createChild() {
  const child = Object.assign(new EventEmitter(), {
    killed: false,
    kill: vi.fn(() => { child.killed = true; return true; }),
    stderr: new PassThrough(),
    stdin: new PassThrough(),
    stdout: new PassThrough(),
  });
  return child;
}

describe('shared local TTS streams', () => {
  let cacheDir: string;
  let child: ReturnType<typeof createChild>;
  let requests: Array<{ id: string; text: string; speed?: number }>;
  let revision: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    cacheDir = await mkdtemp(path.join(os.tmpdir(), 'tts-shared-'));
    const reference = path.join(cacheDir, 'reference.mp3');
    await writeFile(reference, 'test reference bytes');
    vi.stubEnv('LOCAL_TTS_CACHE_DIR', cacheDir);
    vi.stubEnv('LOCAL_TTS_REFERENCE_PATH', reference);
    vi.stubEnv('LOCAL_TTS_MAX_QUEUE', '0');
    revision = await getLocalTtsVoiceRevision();
    child = createChild();
    requests = [];
    child.stdin.on('data', chunk => requests.push(JSON.parse(String(chunk))));
    spawnMock.mockReturnValue(child);
  });

  afterEach(async () => {
    __resetTtsUtteranceCacheForTests();
    child.emit('exit', 0, null);
    await vi.waitFor(() => expect(getLocalTtsQueueState()).toEqual({ active: 0, queued: 0 }));
    vi.unstubAllEnvs();
    await rm(cacheDir, { recursive: true, force: true });
  });

  function chunk(index = 0, voiceRevision = revision) {
    child.stdout.write(`${JSON.stringify({
      audioBase64: pcm.toString('base64'), id: requests[0].id,
      index, sampleRate: 24_000, type: 'chunk', voiceRevision,
    })}\n`);
  }

  function done() {
    child.stdout.write(`${JSON.stringify({
      audioSeconds: 0.001, durationMs: 1, id: requests[0].id,
      sampleRate: 24_000, type: 'done',
    })}\n`);
  }

  it('streams before completion, replays chunks, and isolates subscriber cancellation', async () => {
    const controller = new AbortController();
    const first = streamLocalTtsCached('shared hello', options, controller.signal);
    const firstChunk = first.next();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    chunk();
    await expect(firstChunk).resolves.toMatchObject({ done: false, value: { audio: pcm, index: 0 } });
    const key = buildTtsUtteranceCacheKey('shared hello', options, revision);
    await expect(readTtsUtteranceCache(key)).resolves.toBeNull();
    expect(getLocalTtsQueueState()).toEqual({ active: 1, queued: 0 });

    const second = streamLocalTtsCached('shared hello', { ...options, speed: 1.15 });
    await expect(second.next()).resolves.toMatchObject({ value: { audio: pcm, index: 0 } });
    const aborted = first.next();
    controller.abort();
    await expect(aborted).rejects.toThrow('cancelled');
    expect(child.kill).not.toHaveBeenCalled();
    expect(requests[0]).not.toHaveProperty('speed');
    const next = second.next();
    chunk(1);
    await expect(next).resolves.toMatchObject({ value: { audio: pcm, index: 1 } });
    done();
    await expect(second.next()).resolves.toMatchObject({ done: true });
    expect(requests).toHaveLength(1);
    await expect(readTtsUtteranceCache(key)).resolves.toMatchObject({
      pcm: Buffer.concat([pcm, pcm]), voiceRevision: revision,
    });

    const hit = streamLocalTtsCached('shared hello', options);
    await expect(hit.next()).resolves.toMatchObject({ value: { audio: Buffer.concat([pcm, pcm]) } });
    await hit.return(undefined);
    expect(requests).toHaveLength(1);
  });

  it('detaches the last subscriber promptly without caching its abandoned audio', async () => {
    const controller = new AbortController();
    const stream = streamLocalTtsCached('abandoned', options, controller.signal);
    const pending = stream.next();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    chunk();
    controller.abort();
    await expect(pending).rejects.toThrow('cancelled');
    await new Promise(resolve => setImmediate(resolve));
    expect(getLocalTtsQueueState()).toEqual({ active: 1, queued: 0 });
    done();
    await vi.waitFor(() => expect(getLocalTtsQueueState()).toEqual({ active: 0, queued: 0 }));
    await expect(readTtsUtteranceCache(buildTtsUtteranceCacheKey('abandoned', options, revision))).resolves.toBeNull();
  });

  it('detaches an NDJSON response on reader cancellation without waiting for another chunk', async () => {
    const text = 'cancel response';
    const body = JSON.stringify({ text, stream: true });
    const response = await POST(new Request('http://localhost/api/tts', {
      method: 'POST', body,
      headers: {
        origin: 'https://whoisdhruv.com', 'content-length': String(body.length),
        'x-forwarded-for': 'tts-cancel-integration',
      },
    }) as never);
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    chunk();
    await reader.read();
    await reader.cancel();
    const retry = streamLocalTtsCached(text, options);
    await expect(retry.next()).rejects.toThrow('queue is full');
    done();
    await vi.waitFor(() => expect(getLocalTtsQueueState()).toEqual({ active: 0, queued: 0 }));
    await expect(readTtsUtteranceCache(buildTtsUtteranceCacheKey(text, options, revision))).resolves.toBeNull();
  });

  it.each(['all', 'first', 'last'])('serves but does not cache a worker revision mismatch (%s chunks)', async (mismatch) => {
    const stream = streamLocalTtsCached('reference changed', options);
    const first = stream.next();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const otherRevision = 'b'.repeat(64);
    const firstRevision = mismatch === 'last' ? revision : otherRevision;
    chunk(0, firstRevision);
    await expect(first).resolves.toMatchObject({ value: { voiceRevision: firstRevision } });
    const second = stream.next();
    chunk(1, mismatch === 'first' ? revision : otherRevision);
    await second;
    done();
    await expect(stream.next()).resolves.toMatchObject({ done: true });
    await expect(readTtsUtteranceCache(buildTtsUtteranceCacheKey('reference changed', options, revision))).resolves.toBeNull();
  });

  it('assembles the WAV path from shared chunks', async () => {
    const wav = synthesizeLocalTtsCached('wav hello', options);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    chunk();
    chunk(1);
    done();
    const audio = await wav;
    expect(audio.toString('ascii', 0, 4)).toBe('RIFF');
    expect(audio.subarray(44)).toEqual(Buffer.concat([pcm, pcm]));
  });

  it('pre-checks full queues but allows cached and already-shared utterances', async () => {
    const shared = streamLocalTtsCached('in flight', options);
    const first = shared.next();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await expect(assertLocalTtsQueueAvailable('other', options)).rejects.toThrow('queue is full');
    await expect(assertLocalTtsQueueAvailable('in flight', options)).resolves.toBeUndefined();
    const key = buildTtsUtteranceCacheKey('cached', options, revision);
    await rememberTtsUtterance(key, pcm, { durationMs: 1, sampleRate: 24_000, voiceRevision: revision });
    await expect(assertLocalTtsQueueAvailable('cached', options)).resolves.toBeUndefined();
    const hit = streamLocalTtsCached('cached', options);
    await expect(hit.next()).resolves.toMatchObject({ value: { audio: pcm } });
    await hit.return(undefined);
    chunk();
    await first;
    done();
    await shared.next();
  });

  it('does not consume queue capacity for a pre-check when capacity is available', async () => {
    await expect(assertLocalTtsQueueAvailable('unused', options)).resolves.toBeUndefined();
    const task = vi.fn(async () => undefined);
    await runWithLocalTtsSlot(task);
    expect(task).toHaveBeenCalledOnce();
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
