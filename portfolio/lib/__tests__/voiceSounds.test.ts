import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE_VERSION } from '@/lib/siteVersion';
import {
  __resetVoiceSoundsForTest,
  playVoiceEnterFallback,
  playVoiceSound,
  prefetchVoiceSounds,
  primeVoiceEnterAudio,
  setVoiceAmbientDucked,
  setVoicePcmActive,
  startVoiceAmbient,
  stopVoiceAmbient,
  stopVoiceToggleCue,
  unlockVoiceAudio,
} from '@/lib/voiceSounds';

const soundManagerMock = vi.hoisted(() => ({
  muted: false,
  instances: [] as unknown[],
  stopLoop: vi.fn(),
}));

class FakeAudio {
  preload = '';
  loop = false;
  currentTime = 0;
  paused = true;
  ended = false;
  readyState = 0;
  #volume = 1;
  get volume(): number {
    return this.#volume;
  }
  set volume(value: number) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new DOMException(`IndexSizeError: ${value}`, 'IndexSizeError');
    }
    this.#volume = value;
  }
  readonly play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  readonly pause = vi.fn(() => {
    this.paused = true;
  });
  readonly load = vi.fn(() => {
    this.paused = true;
    this.currentTime = 0;
    this.readyState = 1;
  });

  constructor(readonly src: string) {
    soundManagerMock.instances.push(this);
  }
}

vi.mock('@/hooks/useStickers', () => ({
  getSoundsMutedSync: () => soundManagerMock.muted,
  getMasterVolumeSync: () => 1,
  getEffectiveMasterVolumeSync: () => soundManagerMock.muted ? 0 : 1,
  subscribeMasterVolume: () => () => {},
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
    expect(audio?.volume).toBeCloseTo(0.12);
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
    expect(audio?.volume).toBeCloseTo(0.12);
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

  it('unlocks ambient on the enter gesture then fades the same looping element', async () => {
    unlockVoiceAudio();

    const byId = Object.fromEntries(
      (soundManagerMock.instances as FakeAudio[]).map(audio => {
        const id = audio.src.match(/voice\/(\w+)\.mp3/)?.[1] ?? audio.src;
        return [id, audio];
      }),
    );
    expect(soundManagerMock.instances.map(audio => (audio as FakeAudio).src)).toEqual([
      `/sounds/voice/enter.mp3?v=${SITE_VERSION}`,
      `/sounds/voice/action.mp3?v=${SITE_VERSION}`,
      `/sounds/voice/ambient.mp3?v=${SITE_VERSION}`,
    ]);
    expect(byId.enter?.preload).toBe('auto');
    expect(byId.action?.preload).toBe('auto');
    expect(byId.ambient?.preload).toBe('auto');
    expect(byId.ambient?.play).toHaveBeenCalledTimes(1);
    expect(byId.ambient?.loop).toBe(true);
    expect(byId.ambient?.volume).toBe(0);

    startVoiceAmbient(true);
    await Promise.resolve();

    expect(soundManagerMock.instances).toHaveLength(3);
    expect(byId.ambient?.play).toHaveBeenCalledTimes(1);
    expect(byId.ambient?.loop).toBe(true);
    expect(byId.ambient?.volume).toBeCloseTo(0.12);
  });

  it('does not load() a live ambient loop after unlock + start', async () => {
    unlockVoiceAudio();
    startVoiceAmbient(true);
    await Promise.resolve();

    const ambient = (soundManagerMock.instances as FakeAudio[]).find(audio => (
      audio.src.includes('/sounds/voice/ambient.mp3')
    ));
    expect(ambient).toBeDefined();
    if (!ambient) return;

    ambient.currentTime = 4.2;
    const loadCount = ambient.load.mock.calls.length;
    prefetchVoiceSounds();

    expect(ambient.paused).toBe(false);
    expect(ambient.load).toHaveBeenCalledTimes(loadCount);
    expect(ambient.currentTime).toBe(4.2);
    expect(ambient.play).toHaveBeenCalledTimes(1);
  });

  it('does not pause, load, or mute ambient when unlock runs mid-session', async () => {
    unlockVoiceAudio();
    startVoiceAmbient(true);
    await Promise.resolve();

    const ambient = (soundManagerMock.instances as FakeAudio[]).find(audio => (
      audio.src.includes('/sounds/voice/ambient.mp3')
    ));
    expect(ambient).toBeDefined();
    if (!ambient) return;

    ambient.currentTime = 3.5;
    const loadCount = ambient.load.mock.calls.length;
    const pauseCount = ambient.pause.mock.calls.length;
    unlockVoiceAudio();

    expect(ambient.load).toHaveBeenCalledTimes(loadCount);
    expect(ambient.pause).toHaveBeenCalledTimes(pauseCount);
    expect(ambient.paused).toBe(false);
    expect(ambient.volume).toBeCloseTo(0.12);
    expect(ambient.currentTime).toBe(3.5);
  });

  it('reverts a rejected unlock so start can retry ambient', async () => {
    class RejectUnlockAudio extends FakeAudio {
      override readonly play = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
    }
    vi.stubGlobal('Audio', RejectUnlockAudio);

    unlockVoiceAudio();
    await Promise.resolve();
    await Promise.resolve();

    const ambient = (soundManagerMock.instances as RejectUnlockAudio[]).find(audio => (
      audio.src.includes('/sounds/voice/ambient.mp3')
    ));
    expect(ambient?.play).toHaveBeenCalledTimes(1);
    expect(ambient?.volume).toBe(0);

    startVoiceAmbient(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(ambient?.play).toHaveBeenCalledTimes(2);
  });
});


describe('voice toggle cue and ambient duck', () => {
  beforeEach(() => {
    soundManagerMock.muted = false;
    soundManagerMock.instances.length = 0;
    soundManagerMock.stopLoop.mockClear();
    vi.stubGlobal('Audio', FakeAudio);
  });

  afterEach(() => {
    __resetVoiceSoundsForTest();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function audioById(id: string): FakeAudio | undefined {
    return (soundManagerMock.instances as FakeAudio[]).find(audio => audio.src.includes(`/sounds/voice/${id}.mp3`));
  }

  it('plays the enter cue at 0.22 then fades it out after 450ms', async () => {
    vi.useFakeTimers();
    playVoiceSound('voice-enter');
    await Promise.resolve();

    const enter = audioById('enter');
    expect(enter?.volume).toBeCloseTo(0.22);
    expect(enter?.currentTime).toBe(0);
    expect(enter?.play).toHaveBeenCalledTimes(1);
    expect(enter?.pause).not.toHaveBeenCalled();

    vi.advanceTimersByTime(449);
    expect(enter?.volume).toBeCloseTo(0.22);
    expect(enter?.pause).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(enter?.volume).toBe(0);
    expect(enter?.pause).toHaveBeenCalledTimes(1);
  });

  it('plays the exit cue at 0.22 without a delayed fade', () => {
    vi.useFakeTimers();
    playVoiceSound('voice-exit');

    const exit = audioById('exit');
    expect(exit?.volume).toBeCloseTo(0.22);
    expect(exit?.currentTime).toBe(0);
    expect(exit?.play).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(450);
    expect(exit?.volume).toBeCloseTo(0.22);
    expect(exit?.pause).not.toHaveBeenCalled();
  });

  it('leaves the action cue at 0.38 without a delayed fade', () => {
    vi.useFakeTimers();
    playVoiceSound('voice-action');

    const action = audioById('action');
    expect(action?.volume).toBeCloseTo(0.38);
    expect(action?.currentTime).toBe(0);
    expect(action?.play).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(450);
    expect(action?.volume).toBeCloseTo(0.38);
    expect(action?.pause).not.toHaveBeenCalled();
  });

  it('does not pause the enter cue during the 450ms play window unless forced', async () => {
    vi.useFakeTimers();
    playVoiceSound('voice-enter');
    await Promise.resolve();

    const enter = audioById('enter');
    stopVoiceToggleCue();
    expect(enter?.volume).toBeCloseTo(0.22);
    expect(enter?.pause).not.toHaveBeenCalled();

    stopVoiceToggleCue({ force: true });
    expect(enter?.volume).toBe(0);
    expect(enter?.pause).toHaveBeenCalledTimes(1);
  });

  it('primes the enter cue once and skips an immediate fallback replay', () => {
    primeVoiceEnterAudio();
    const enter = audioById('enter');
    expect(enter?.volume).toBeCloseTo(0.22);
    expect(enter?.play).toHaveBeenCalledTimes(1);

    playVoiceEnterFallback();
    expect(enter?.play).toHaveBeenCalledTimes(1);

    __resetVoiceSoundsForTest();
    playVoiceEnterFallback();
    expect(audioById('enter')?.play).toHaveBeenCalledTimes(1);
  });

  it('never assigns an out-of-range HTMLAudio volume during fade, duck, or stop', async () => {
    startVoiceAmbient(true);
    await Promise.resolve();
    setVoiceAmbientDucked(true);
    setVoiceAmbientDucked(false);
    playVoiceSound('voice-enter');
    stopVoiceToggleCue({ force: true });
    stopVoiceAmbient({ fadeMs: 0 });

    for (const audio of soundManagerMock.instances as FakeAudio[]) {
      expect(audio.volume).toBeGreaterThanOrEqual(0);
      expect(audio.volume).toBeLessThanOrEqual(1);
    }
  });

  it('ducks playing ambient to about 0.04 without pausing, then restores 0.12', async () => {
    startVoiceAmbient(true);
    await Promise.resolve();

    const ambient = audioById('ambient');
    expect(ambient?.volume).toBeCloseTo(0.12);
    expect(ambient?.paused).toBe(false);
    const pauseCount = ambient?.pause.mock.calls.length ?? 0;

    setVoiceAmbientDucked(true);
    expect(ambient?.volume).toBeCloseTo(0.04);
    expect(ambient?.paused).toBe(false);
    expect(ambient?.pause).toHaveBeenCalledTimes(pauseCount);

    setVoiceAmbientDucked(false);
    expect(ambient?.volume).toBeCloseTo(0.12);
    expect(ambient?.paused).toBe(false);
    expect(ambient?.pause).toHaveBeenCalledTimes(pauseCount);
  });

  it('does not restart a duck fade when already ducked', async () => {
    startVoiceAmbient(true);
    await Promise.resolve();

    const ambient = audioById('ambient');
    expect(ambient).toBeDefined();
    if (!ambient) return;

    setVoiceAmbientDucked(true);
    expect(ambient.volume).toBeCloseTo(0.04);

    ambient.volume = 0.22;
    setVoiceAmbientDucked(true);
    expect(ambient.volume).toBeCloseTo(0.22);
  });

  it('no-ops ducking when ambient is idle', () => {
    setVoiceAmbientDucked(true);
    expect(soundManagerMock.instances).toHaveLength(0);
  });

  it('fades coarse-pointer ambient to about 0.084 and ducks to about 0.028', async () => {
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({ matches: query === '(pointer: coarse)' }),
    });

    startVoiceAmbient(true);
    await Promise.resolve();

    const ambient = audioById('ambient');
    expect(ambient?.volume).toBeCloseTo(0.084);
    expect(ambient?.paused).toBe(false);

    setVoiceAmbientDucked(true);
    expect(ambient?.volume).toBeCloseTo(0.028);
    expect(ambient?.paused).toBe(false);
  });

  it('prefetches with preload auto and load, without calling play', () => {
    prefetchVoiceSounds();

    const audios = soundManagerMock.instances as FakeAudio[];
    expect(audios).toHaveLength(4);
    for (const audio of audios) {
      expect(audio.preload).toBe('auto');
      expect(audio.load).toHaveBeenCalledTimes(1);
      expect(audio.play).not.toHaveBeenCalled();
    }
  });

  it('does not consume a delayed enter prime until play() starts, then fallback skips', async () => {
    let resolveEnter: (() => void) | undefined;
    class DelayedEnterAudio extends FakeAudio {
      override readonly play = vi.fn(() => {
        if (!this.src.includes('/sounds/voice/enter.mp3')) {
          this.paused = false;
          return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
          resolveEnter = () => {
            this.paused = false;
            resolve();
          };
        });
      });
    }
    vi.stubGlobal('Audio', DelayedEnterAudio);

    primeVoiceEnterAudio();
    const enter = audioById('enter');
    expect(enter?.play).toHaveBeenCalledTimes(1);

    playVoiceEnterFallback();
    expect(enter?.play).toHaveBeenCalledTimes(1);
    expect(enter?.pause).not.toHaveBeenCalled();

    resolveEnter?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(enter?.play).toHaveBeenCalledTimes(1);

    playVoiceEnterFallback();
    expect(enter?.play).toHaveBeenCalledTimes(1);
  });

  it('resets a rejected enter prime so fallback can retry on a new element', async () => {
    class RejectEnterAudio extends FakeAudio {
      override readonly play = vi.fn(() => {
        if (this.src.includes('/sounds/voice/enter.mp3')) {
          return Promise.reject(new Error('NotAllowedError'));
        }
        this.paused = false;
        return Promise.resolve();
      });
    }
    vi.stubGlobal('Audio', RejectEnterAudio);

    primeVoiceEnterAudio();
    const primed = audioById('enter');
    playVoiceEnterFallback();
    expect(primed?.play).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    await Promise.resolve();

    expect(primed?.pause).toHaveBeenCalled();
    const afterReject = (soundManagerMock.instances as FakeAudio[]).filter(audio => (
      audio.src.includes('/sounds/voice/enter.mp3')
    ));
    expect(afterReject).toHaveLength(2);
    expect(afterReject[1]?.play).toHaveBeenCalledTimes(1);
  });

  it('silences enter/action cues and ambient while PCM is active, then restores ambient', async () => {
    startVoiceAmbient(true);
    await Promise.resolve();
    playVoiceSound('voice-enter');
    await Promise.resolve();
    playVoiceSound('voice-action');

    const enter = audioById('enter');
    const action = audioById('action');
    const ambient = audioById('ambient');
    const exitBefore = audioById('exit');
    expect(exitBefore).toBeUndefined();
    expect(ambient?.volume).toBeCloseTo(0.12);
    expect(enter?.play).toHaveBeenCalledTimes(1);
    expect(action?.play).toHaveBeenCalledTimes(1);

    setVoicePcmActive(true);
    expect(enter?.volume).toBe(0);
    expect(enter?.pause).toHaveBeenCalled();
    expect(action?.volume).toBe(0);
    expect(action?.pause).toHaveBeenCalled();
    expect(ambient?.volume).toBe(0);
    expect(ambient?.paused).toBe(false);

    playVoiceSound('voice-enter');
    playVoiceSound('voice-action');
    playVoiceSound('voice-exit');
    expect(enter?.play).toHaveBeenCalledTimes(1);
    expect(action?.play).toHaveBeenCalledTimes(1);
    expect(audioById('exit')?.play).toHaveBeenCalledTimes(1);

    setVoicePcmActive(false);
    expect(ambient?.volume).toBeCloseTo(0.12);
    expect(ambient?.paused).toBe(false);
  });

  it('restores ducked ambient after PCM silence', async () => {
    startVoiceAmbient(true);
    await Promise.resolve();
    setVoiceAmbientDucked(true);
    const ambient = audioById('ambient');
    expect(ambient?.volume).toBeCloseTo(0.04);

    setVoicePcmActive(true);
    expect(ambient?.volume).toBe(0);

    setVoicePcmActive(false);
    expect(ambient?.volume).toBeCloseTo(0.04);
    expect(ambient?.paused).toBe(false);
  });
});