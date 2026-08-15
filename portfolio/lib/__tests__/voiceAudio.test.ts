import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EndedHandler = () => void;

class FakeSource {
  ended: EndedHandler | null = null;

  addEventListener(type: string, handler: EndedHandler): void {
    if (type === 'ended') this.ended = handler;
  }

  connect(): void {}

  start(): void {}

  stop(): void {
    this.ended?.();
  }
}

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  sources: FakeSource[] = [];

  createBuffer(...args: number[]) {
    const length = args[1] ?? 0;
    return {
      duration: length / 24_000,
      getChannelData: () => new Float32Array(length),
    };
  }

  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }

  resume() {
    return Promise.resolve();
  }

  close() {
    return Promise.resolve();
  }
}

describe('voice playback idle tracking', () => {
  let context: FakeAudioContext;

  beforeEach(() => {
    vi.useFakeTimers();
    context = new FakeAudioContext();
    function AudioContextStub() {
      return context;
    }
    vi.stubGlobal('AudioContext', AudioContextStub);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is busy while a source is live and becomes idle after ended plus the tail timer', async () => {
    const { createVoicePlayback } = await import('@/lib/voiceAudio');
    const playback = createVoicePlayback();
    const idle = vi.fn();
    playback.subscribeIdle(idle);

    const samples = new Int16Array(24_000);
    playback.play(samples.buffer);
    expect(playback.isBusy()).toBe(true);
    expect(idle).not.toHaveBeenCalled();

    context.sources[0]?.ended?.();
    expect(playback.isBusy()).toBe(true);

    await vi.advanceTimersByTimeAsync(1_020);
    expect(playback.isBusy()).toBe(false);
    expect(idle).toHaveBeenCalled();
    playback.close();
  });

  it('becomes idle immediately after interrupt', async () => {
    const { createVoicePlayback } = await import('@/lib/voiceAudio');
    const playback = createVoicePlayback();
    const idle = vi.fn();
    playback.subscribeIdle(idle);

    playback.play(new Int16Array(2_400).buffer);
    expect(playback.isBusy()).toBe(true);

    playback.interrupt();
    expect(playback.isBusy()).toBe(false);
    expect(idle).toHaveBeenCalled();
    playback.close();
  });
});
