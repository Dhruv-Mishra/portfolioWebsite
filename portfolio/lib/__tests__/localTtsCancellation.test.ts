import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mkdirMock, spawnMock } = vi.hoisted(() => ({
  mkdirMock: vi.fn(async () => undefined),
  spawnMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('node:fs/promises', () => ({
  mkdir: mkdirMock,
}));

import {
  getLocalTtsQueueState,
  isTtsQueueFullError,
  isTtsRequestAbortedError,
  runWithLocalTtsSlot,
  synthesizeLocalTts,
  type LocalTtsOptions,
} from '@/lib/localTts.server';

interface WorkerRequest {
  id: string;
  text: string;
}

function createWorkerResult(id: string): string {
  const audio = new Float32Array([0.25, -0.25]);

  return `${JSON.stringify({
    audioBase64: Buffer.from(audio.buffer).toString('base64'),
    id,
    sampleRate: 24_000,
    speedApplied: true,
    type: 'result',
  })}\n`;
}

describe('local TTS worker cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('LOCAL_TTS_CONCURRENCY', '2');
    vi.stubEnv('LOCAL_TTS_MAX_QUEUE', '0');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('holds aborted inference capacity until its terminal worker response', async () => {
    const child = new EventEmitter() as EventEmitter & {
      killed: boolean;
      kill: ReturnType<typeof vi.fn>;
      stderr: PassThrough;
      stdin: PassThrough;
      stdout: PassThrough;
    };
    child.killed = false;
    child.kill = vi.fn(() => {
      child.killed = true;
      return true;
    });
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    spawnMock.mockReturnValue(child);

    const requests: WorkerRequest[] = [];
    child.stdin.on('data', chunk => {
      requests.push(JSON.parse(String(chunk)) as WorkerRequest);
    });

    const options: LocalTtsOptions = { speed: 1.08, voice: 'expr-voice-5-m' };
    const abortController = new AbortController();
    const abortedRequest = runWithLocalTtsSlot(
      () => synthesizeLocalTts('cancel this request', options, abortController.signal),
      abortController.signal,
    );
    const survivingRequest = runWithLocalTtsSlot(() => synthesizeLocalTts('keep this request', options));

    await vi.waitFor(() => expect(requests).toHaveLength(2));
    abortController.abort();

    await expect(abortedRequest).rejects.toSatisfy(isTtsRequestAbortedError);
    expect(getLocalTtsQueueState()).toEqual({ active: 2, queued: 0 });

    const capacityProbe = vi.fn(async () => Buffer.alloc(0));
    await expect(runWithLocalTtsSlot(capacityProbe)).rejects.toSatisfy(isTtsQueueFullError);
    expect(capacityProbe).not.toHaveBeenCalled();

    child.stdout.write(createWorkerResult(requests[0].id));
    await vi.waitFor(() => expect(getLocalTtsQueueState()).toEqual({ active: 1, queued: 0 }));

    await expect(runWithLocalTtsSlot(capacityProbe)).resolves.toEqual(Buffer.alloc(0));
    child.stdout.write(createWorkerResult(requests[1].id));

    await expect(survivingRequest).resolves.toEqual(expect.any(Buffer));
    expect(getLocalTtsQueueState()).toEqual({ active: 0, queued: 0 });
    expect(spawnMock).toHaveBeenCalledTimes(1);

    const workerFailureController = new AbortController();
    const abortedBeforeWorkerFailure = runWithLocalTtsSlot(
      () => synthesizeLocalTts('fail after caller abort', options, workerFailureController.signal),
      workerFailureController.signal,
    );
    await vi.waitFor(() => expect(requests).toHaveLength(3));

    workerFailureController.abort();
    await expect(abortedBeforeWorkerFailure).rejects.toSatisfy(isTtsRequestAbortedError);
    expect(getLocalTtsQueueState()).toEqual({ active: 1, queued: 0 });

    child.emit('error', new Error('worker failed'));
    child.emit('exit', 1, null);

    await vi.waitFor(() => expect(getLocalTtsQueueState()).toEqual({ active: 0, queued: 0 }));
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it('reserves released capacity for the selected queued waiter', async () => {
    vi.stubEnv('LOCAL_TTS_CONCURRENCY', '1');
    vi.stubEnv('LOCAL_TTS_MAX_QUEUE', '1');

    let finishFirst: (() => void) | undefined;
    let finishSecond: (() => void) | undefined;
    const firstTask = vi.fn(() => new Promise<void>(resolve => { finishFirst = resolve; }));
    const secondTask = vi.fn(() => new Promise<void>(resolve => { finishSecond = resolve; }));
    const thirdTask = vi.fn(async () => undefined);

    const first = runWithLocalTtsSlot(firstTask);
    const second = runWithLocalTtsSlot(secondTask);
    await vi.waitFor(() => expect(getLocalTtsQueueState()).toEqual({ active: 1, queued: 1 }));

    finishFirst?.();
    await expect(first).resolves.toBeUndefined();
    await vi.waitFor(() => expect(secondTask).toHaveBeenCalledTimes(1));
    expect(getLocalTtsQueueState()).toEqual({ active: 1, queued: 0 });

    const third = runWithLocalTtsSlot(thirdTask);
    expect(thirdTask).not.toHaveBeenCalled();
    expect(getLocalTtsQueueState()).toEqual({ active: 1, queued: 1 });

    finishSecond?.();
    await expect(second).resolves.toBeUndefined();
    await expect(third).resolves.toBeUndefined();
    expect(thirdTask).toHaveBeenCalledTimes(1);
    expect(getLocalTtsQueueState()).toEqual({ active: 0, queued: 0 });
  });
});