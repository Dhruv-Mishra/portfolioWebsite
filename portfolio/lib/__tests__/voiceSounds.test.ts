import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE_VERSION } from '@/lib/siteVersion';
import {
  __resetVoiceSoundsForTest,
  playVoiceSound,
  setVoiceAmbientDucked,
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
  volume = 1;
  currentTime = 0;
  paused = true;
  ended = false;
  readonly play = vi.fn(() => {
    this.paused = false;
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

  it('unlocks ambient on the enter gesture then fades the same looping element', async () => {
    unlockVoiceAudio();

    const byId = Object.fromEntries(
      (soundManagerMock.instances as FakeAudio[]).map(audio => {
        const id = audio.src.match(/voice\/(\w+)\.mp3/)?.[1] ?? audio.src;
        return [id, audio];
      }),
    );
    expect(soundManagerMock.instances.map(audio => (audio as FakeAudio).src)).toEqual([
      `/sounds/voice/toggle.mp3?v=${SITE_VERSION}`,
      `/sounds/voice/action.mp3?v=${SITE_VERSION}`,
      `/sounds/voice/ambient.mp3?v=${SITE_VERSION}`,
    ]);
    expect(byId.ambient?.play).toHaveBeenCalledTimes(1);
    expect(byId.ambient?.loop).toBe(true);
    expect(byId.ambient?.volume).toBe(0);

    startVoiceAmbient(true);
    await Promise.resolve();

    expect(soundManagerMock.instances).toHaveLength(3);
    expect(byId.ambient?.play).toHaveBeenCalledTimes(1);
    expect(byId.ambient?.loop).toBe(true);
    expect(byId.ambient?.volume).toBeCloseTo(0.36);
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

  it('plays the toggle cue at 0.22 then fades it out after 450ms', () => {
    vi.useFakeTimers();
    playVoiceSound('voice-toggle');

    const toggle = audioById('toggle');
    expect(toggle?.volume).toBeCloseTo(0.22);
    expect(toggle?.currentTime).toBe(0);
    expect(toggle?.play).toHaveBeenCalledTimes(1);
    expect(toggle?.pause).not.toHaveBeenCalled();

    vi.advanceTimersByTime(449);
    expect(toggle?.volume).toBeCloseTo(0.22);
    expect(toggle?.pause).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(toggle?.volume).toBe(0);
    expect(toggle?.pause).toHaveBeenCalledTimes(1);
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

  it('stops the toggle cue immediately', () => {
    vi.useFakeTimers();
    playVoiceSound('voice-toggle');
    stopVoiceToggleCue();

    const toggle = audioById('toggle');
    expect(toggle?.volume).toBe(0);
    expect(toggle?.pause).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(450);
    expect(toggle?.pause).toHaveBeenCalledTimes(1);
  });

  it('ducks playing ambient to about 0.10 without pausing, then restores 0.36', async () => {
    startVoiceAmbient(true);
    await Promise.resolve();

    const ambient = audioById('ambient');
    expect(ambient?.volume).toBeCloseTo(0.36);
    expect(ambient?.paused).toBe(false);
    const pauseCount = ambient?.pause.mock.calls.length ?? 0;

    setVoiceAmbientDucked(true);
    expect(ambient?.volume).toBeCloseTo(0.10);
    expect(ambient?.paused).toBe(false);
    expect(ambient?.pause).toHaveBeenCalledTimes(pauseCount);

    setVoiceAmbientDucked(false);
    expect(ambient?.volume).toBeCloseTo(0.36);
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
    expect(ambient.volume).toBeCloseTo(0.10);

    ambient.volume = 0.22;
    setVoiceAmbientDucked(true);
    expect(ambient.volume).toBeCloseTo(0.22);
  });

  it('no-ops ducking when ambient is idle', () => {
    setVoiceAmbientDucked(true);
    expect(soundManagerMock.instances).toHaveLength(0);
  });
});