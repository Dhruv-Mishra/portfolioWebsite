import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE_VERSION } from '@/lib/siteVersion';

const getEffectiveAudioCategoryVolumeSync = vi.fn(() => 1);
const getDiscoActiveSync = vi.fn(() => false);
const volumeListeners: Array<(volume: number) => void> = [];
const discoListeners: Array<(active: boolean) => void> = [];
const subscribeAudioCategoryVolume = vi.fn((
  _category: string,
  listener: (volume: number) => void,
) => {
  volumeListeners.push(listener);
  return () => {
    const index = volumeListeners.indexOf(listener);
    if (index >= 0) volumeListeners.splice(index, 1);
  };
});
const subscribeDiscoActive = vi.fn((listener: (active: boolean) => void) => {
  discoListeners.push(listener);
  return () => {
    const index = discoListeners.indexOf(listener);
    if (index >= 0) discoListeners.splice(index, 1);
  };
});

vi.mock('@/hooks/useStickers', () => ({
  getEffectiveAudioCategoryVolumeSync: () => getEffectiveAudioCategoryVolumeSync(),
  getDiscoActiveSync: () => getDiscoActiveSync(),
  subscribeAudioCategoryVolume: (
    category: string,
    listener: (volume: number) => void,
  ) => subscribeAudioCategoryVolume(category, listener),
  subscribeDiscoActive: (listener: (active: boolean) => void) => subscribeDiscoActive(listener),
}));

class FakeAudio {
  src: string;
  loop = false;
  preload = 'auto';
  muted = false;
  volume = 1;
  currentTime = 0;
  paused = true;
  playCalls = 0;
  pauseCalls = 0;
  playShouldReject = false;
  onended: (() => void) | null = null;

  constructor(src: string) {
    this.src = src;
  }

  play() {
    this.playCalls += 1;
    if (this.playShouldReject) return Promise.reject(new Error('blocked'));
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.pauseCalls += 1;
    this.paused = true;
  }

  finish() {
    this.paused = true;
    this.onended?.();
  }
}

const created: FakeAudio[] = [];

describe('voiceSounds helper', () => {
  beforeEach(() => {
    created.length = 0;
    volumeListeners.length = 0;
    discoListeners.length = 0;
    getEffectiveAudioCategoryVolumeSync.mockReturnValue(1);
    getDiscoActiveSync.mockReturnValue(false);
    subscribeAudioCategoryVolume.mockClear();
    subscribeDiscoActive.mockClear();
    vi.stubGlobal('window', {});
    vi.stubGlobal('Audio', class AudioStub {
      constructor(src: string) {
        const el = new FakeAudio(src);
        created.push(el);
        return el;
      }
    });
  });

  afterEach(async () => {
    const { resetVoiceSoundsForTests } = await import('@/lib/voiceSounds');
    resetVoiceSoundsForTests();
    vi.unstubAllGlobals();
  });

  it('no-ops on SSR and unlocks cached versioned elements with relative voiceAgent gain', async () => {
    vi.unstubAllGlobals();
    const {
      primeVoiceSounds,
      startVoiceAmbient,
      playVoiceAction,
      playVoiceToggle,
      stopVoiceSounds,
      resetVoiceSoundsForTests,
    } = await import('@/lib/voiceSounds');
    expect(() => {
      primeVoiceSounds();
      startVoiceAmbient();
      playVoiceAction();
      playVoiceToggle();
      stopVoiceSounds();
    }).not.toThrow();
    resetVoiceSoundsForTests();

    vi.stubGlobal('window', {});
    vi.stubGlobal('Audio', class AudioStub {
      constructor(src: string) {
        const el = new FakeAudio(src);
        created.push(el);
        return el;
      }
    });

    getEffectiveAudioCategoryVolumeSync.mockReturnValue(0.5);
    primeVoiceSounds();
    expect(created).toHaveLength(3);
    expect(created[0]?.src).toBe(`/sounds/voice/ambient.mp3?v=${SITE_VERSION}`);
    expect(created[1]?.src).toBe(`/sounds/voice/action.mp3?v=${SITE_VERSION}`);
    expect(created[2]?.src).toBe(`/sounds/voice/toggle.mp3?v=${SITE_VERSION}`);
    expect(created[0]?.loop).toBe(true);
    expect(created[1]?.loop).toBe(false);
    expect(created[0]?.volume).toBeCloseTo(0.18, 5);
    expect(created[1]?.volume).toBeCloseTo(0.19, 5);
    expect(created[2]?.volume).toBeCloseTo(0.19, 5);
    expect(created[0]?.muted).toBe(true);
    expect(created[1]?.muted).toBe(true);
    expect(created[2]?.muted).toBe(false);

    await Promise.resolve();
    await Promise.resolve();
    expect(created[0]?.paused).toBe(true);
    expect(created[1]?.paused).toBe(true);
    expect(created[0]?.muted).toBe(false);
    expect(created[1]?.muted).toBe(false);
    expect(created[0]?.currentTime).toBe(0);
    expect(created[1]?.currentTime).toBe(0);
    expect(subscribeAudioCategoryVolume).not.toHaveBeenCalled();

    primeVoiceSounds();
    expect(created).toHaveLength(3);
  });

  it('starts ambient only after the lifecycle toggle finishes', async () => {
    const {
      playVoiceToggle,
      primeVoiceSounds,
      startVoiceAmbient,
    } = await import('@/lib/voiceSounds');

    primeVoiceSounds();
    await Promise.resolve();
    await Promise.resolve();
    const ambient = created[0]!;
    const toggle = created[2]!;
    ambient.playCalls = 0;

    playVoiceToggle(startVoiceAmbient);
    expect(toggle.playCalls).toBe(1);
    expect(ambient.playCalls).toBe(0);

    toggle.finish();
    expect(ambient.playCalls).toBe(1);
    expect(ambient.loop).toBe(true);
  });

  it('starts ambient once when lifecycle toggle playback is rejected', async () => {
    const {
      playVoiceToggle,
      primeVoiceSounds,
      startVoiceAmbient,
    } = await import('@/lib/voiceSounds');

    primeVoiceSounds();
    await Promise.resolve();
    await Promise.resolve();
    const ambient = created[0]!;
    const toggle = created[2]!;
    ambient.playCalls = 0;
    toggle.playShouldReject = true;

    playVoiceToggle(startVoiceAmbient);
    expect(ambient.playCalls).toBe(0);

    await Promise.resolve();
    await Promise.resolve();
    expect(ambient.playCalls).toBe(1);

    toggle.finish();
    expect(ambient.playCalls).toBe(1);
  });

  it('starts only ambient, plays only action, subscribes while active, and swallows play rejection', async () => {
    const {
      primeVoiceSounds,
      startVoiceAmbient,
      playVoiceAction,
      stopVoiceSounds,
    } = await import('@/lib/voiceSounds');

    primeVoiceSounds();
    await Promise.resolve();
    await Promise.resolve();
    const ambient = created[0]!;
    const action = created[1]!;
    ambient.playCalls = 0;
    action.playCalls = 0;

    startVoiceAmbient();
    expect(ambient.playCalls).toBe(1);
    expect(action.playCalls).toBe(0);
    expect(ambient.loop).toBe(true);
    expect(subscribeAudioCategoryVolume).toHaveBeenCalledTimes(1);
    expect(subscribeAudioCategoryVolume.mock.calls[0]?.[0]).toBe('voiceAgent');

    action.currentTime = 1.2;
    playVoiceAction();
    expect(action.currentTime).toBe(0);
    expect(action.playCalls).toBe(1);
    expect(ambient.playCalls).toBe(1);
    expect(subscribeAudioCategoryVolume).toHaveBeenCalledTimes(1);

    volumeListeners[0]?.(0.25);
    expect(ambient.volume).toBeCloseTo(0.09, 5);
    expect(action.volume).toBeCloseTo(0.095, 5);

    action.playShouldReject = true;
    action.currentTime = 0.4;
    expect(() => playVoiceAction()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    stopVoiceSounds();
    expect(ambient.paused).toBe(true);
    expect(action.paused).toBe(true);
    expect(ambient.currentTime).toBe(0);
    expect(action.currentTime).toBe(0);
    expect(volumeListeners).toHaveLength(0);

    startVoiceAmbient();
    expect(subscribeAudioCategoryVolume).toHaveBeenCalledTimes(2);
    expect(created).toHaveLength(3);
  });

  it('does not replay, pause, reset, or mute live ambient when primed after start', async () => {
    const { primeVoiceSounds, startVoiceAmbient } = await import('@/lib/voiceSounds');
    startVoiceAmbient();
    const ambient = created[0]!;
    const action = created[1]!;
    const playCalls = ambient.playCalls;
    const pauseCalls = ambient.pauseCalls;
    const currentTime = ambient.currentTime;
    const muted = ambient.muted;
    const actionPlayCalls = action.playCalls;
    const actionPauseCalls = action.pauseCalls;

    primeVoiceSounds();
    expect(ambient.playCalls).toBe(playCalls);
    expect(ambient.pauseCalls).toBe(pauseCalls);
    expect(ambient.currentTime).toBe(currentTime);
    expect(ambient.muted).toBe(muted);
    expect(ambient.paused).toBe(false);
    expect(action.playCalls).toBe(actionPlayCalls);
    expect(action.pauseCalls).toBe(actionPauseCalls);
  });

  it('does not let a late prime unlock restore pause live ambient', async () => {
    const { primeVoiceSounds, startVoiceAmbient } = await import('@/lib/voiceSounds');
    const unlockDeferred: { resolve: (() => void) | null } = { resolve: null };
    primeVoiceSounds();
    const ambient = created[0]!;
    ambient.play = () => {
      ambient.playCalls += 1;
      ambient.paused = false;
      return new Promise<void>(resolve => {
        unlockDeferred.resolve = resolve;
      });
    };

    primeVoiceSounds();
    expect(ambient.muted).toBe(true);
    startVoiceAmbient();
    expect(ambient.paused).toBe(false);
    expect(ambient.muted).toBe(false);

    unlockDeferred.resolve?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(ambient.paused).toBe(false);
    expect(ambient.muted).toBe(false);
  });

  it('suppresses ambient while disco is active, resumes only while requested, and does not revive after stop', async () => {
    const {
      startVoiceAmbient,
      playVoiceAction,
      playVoiceToggle,
      stopVoiceSounds,
    } = await import('@/lib/voiceSounds');

    const setDisco = (active: boolean) => {
      getDiscoActiveSync.mockReturnValue(active);
      for (const listener of [...discoListeners]) listener(active);
    };

    setDisco(true);
    startVoiceAmbient();
    const ambient = created[0]!;
    const action = created[1]!;
    const toggle = created[2]!;
    expect(ambient.playCalls).toBe(0);
    expect(ambient.paused).toBe(true);
    expect(subscribeDiscoActive).toHaveBeenCalledTimes(1);

    setDisco(false);
    expect(ambient.playCalls).toBe(1);
    expect(ambient.paused).toBe(false);

    ambient.currentTime = 1.4;
    setDisco(true);
    expect(ambient.paused).toBe(true);
    expect(ambient.currentTime).toBe(1.4);

    playVoiceAction();
    playVoiceToggle();
    expect(action.playCalls).toBe(1);
    expect(toggle.playCalls).toBe(1);

    setDisco(false);
    expect(ambient.playCalls).toBe(2);
    expect(ambient.paused).toBe(false);
    expect(ambient.currentTime).toBe(1.4);

    stopVoiceSounds();
    expect(ambient.paused).toBe(true);
    expect(ambient.currentTime).toBe(0);
    expect(discoListeners).toHaveLength(0);

    const playCallsAfterStop = ambient.playCalls;
    setDisco(true);
    setDisco(false);
    expect(ambient.playCalls).toBe(playCallsAfterStop);
    expect(ambient.paused).toBe(true);
  });
});
