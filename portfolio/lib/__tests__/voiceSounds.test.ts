import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetVoiceSoundsForTest,
  startVoiceAmbient,
  stopVoiceAmbient,
} from '@/lib/voiceSounds';

const soundManagerMock = vi.hoisted(() => ({
  muted: false,
  instances: [] as unknown[],
  stopLoop: vi.fn(),
}));

class FakeAudio {
  preload = '';
  loop = false;
  volume = 1;
  currentTime = 0;
  paused = true;
  ended = false;
  readonly play = vi.fn(() => {
    this.paused = false;
    this.currentTime = 0.01;
    return Promise.resolve();
  });
  readonly pause = vi.fn(() => {
    this.paused = true;
  });
  readonly load = vi.fn();

  constructor(readonly src: string) {
    soundManagerMock.instances.push(this);
  }
}

vi.mock('@/hooks/useStickers', () => ({
  getSoundsMutedSync: () => soundManagerMock.muted,
}));

vi.mock('@/lib/soundManager', () => ({
  soundManager: {
    stopLoop: soundManagerMock.stopLoop,
  },
}));

describe('voice ambient sound', () => {
  beforeEach(() => {
    soundManagerMock.muted = false;
    soundManagerMock.instances.length = 0;
    soundManagerMock.stopLoop.mockClear();
    vi.stubGlobal('Audio', FakeAudio);
  });

  afterEach(() => {
    __resetVoiceSoundsForTest();
    vi.unstubAllGlobals();
  });

  it('preempts disco before playing and reuses one audible ambient element', async () => {
    startVoiceAmbient(true);
    startVoiceAmbient(true);
    await Promise.resolve();

    const audio = soundManagerMock.instances[0] as FakeAudio | undefined;
    expect(soundManagerMock.instances).toHaveLength(1);
    expect(soundManagerMock.stopLoop).toHaveBeenCalledTimes(2);
    expect(audio?.play).toHaveBeenCalledTimes(1);
    expect(soundManagerMock.stopLoop.mock.invocationCallOrder[0]).toBeLessThan(
      audio?.play.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(audio?.loop).toBe(true);
    expect(audio?.volume).toBeCloseTo(0.36);
  });

  it('keeps ambient silent when sound mute is enabled', () => {
    soundManagerMock.muted = true;
    startVoiceAmbient(true);

    expect(soundManagerMock.stopLoop).toHaveBeenCalledWith('disco-loop');
    expect(soundManagerMock.instances).toHaveLength(0);
  });

  it('keeps ambient silent when the caller disables it', () => {
    startVoiceAmbient(false);

    expect(soundManagerMock.stopLoop).toHaveBeenCalledWith('disco-loop');
    expect(soundManagerMock.instances).toHaveLength(0);
  });

  it('leaves ambient retryable after play() rejects', async () => {
    let rejectNextPlay = true;
    class RejectOnceAudio extends FakeAudio {
      override readonly play = vi.fn(() => {
        if (rejectNextPlay) {
          rejectNextPlay = false;
          return Promise.reject(new Error('NotAllowedError'));
        }
        this.paused = false;
        this.currentTime = 0.01;
        return Promise.resolve();
      });
    }
    vi.stubGlobal('Audio', RejectOnceAudio);

    startVoiceAmbient(true);
    await Promise.resolve();
    await Promise.resolve();

    const audio = soundManagerMock.instances[0] as RejectOnceAudio | undefined;
    expect(soundManagerMock.instances).toHaveLength(1);
    expect(audio?.play).toHaveBeenCalledTimes(1);
    expect(audio?.volume).toBe(0);

    startVoiceAmbient(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(audio?.play).toHaveBeenCalledTimes(2);
    expect(audio?.loop).toBe(true);
    expect(audio?.volume).toBeCloseTo(0.36);
  });

  it('stops and resets the cached ambient element', () => {
    startVoiceAmbient(true);
    const audio = soundManagerMock.instances[0] as FakeAudio | undefined;

    stopVoiceAmbient({ fadeMs: 0 });

    expect(audio?.pause).toHaveBeenCalledTimes(1);
    expect(audio?.currentTime).toBe(0);
    expect(audio?.volume).toBe(0);
    expect(soundManagerMock.stopLoop).toHaveBeenCalledWith('disco-loop');
  });
});
