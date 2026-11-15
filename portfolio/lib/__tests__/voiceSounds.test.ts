import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VOICE_SOUND_TOKENS } from '@/lib/designTokens';

const audioState = vi.hoisted(() => ({
  volume: 1,
  disco: false,
  volumeListeners: [] as Array<(volume: number) => void>,
  discoListeners: [] as Array<(active: boolean) => void>,
}));

vi.mock('@/hooks/useStickers', () => ({
  getEffectiveAudioCategoryVolumeSync: () => audioState.volume,
  getDiscoActiveSync: () => audioState.disco,
  subscribeAudioCategoryVolume: (_category: string, listener: (volume: number) => void) => {
    audioState.volumeListeners.push(listener);
    return () => audioState.volumeListeners.splice(audioState.volumeListeners.indexOf(listener), 1);
  },
  subscribeDiscoActive: (listener: (active: boolean) => void) => {
    audioState.discoListeners.push(listener);
    return () => audioState.discoListeners.splice(audioState.discoListeners.indexOf(listener), 1);
  },
}));

class FakeParam {
  value: number;
  target: number;
  events: Array<{ kind: string; value: number; at: number; constant?: number }> = [];
  constructor(value: number) {
    this.value = value;
    this.target = value;
  }
  setValueAtTime(value: number, at: number) { this.target = value; this.events.push({ kind: 'set', value, at }); return this; }
  setTargetAtTime(value: number, at: number, constant: number) { this.target = value; this.events.push({ kind: 'target', value, at, constant }); return this; }
  linearRampToValueAtTime(value: number, at: number) { this.target = value; this.events.push({ kind: 'linear', value, at }); return this; }
  exponentialRampToValueAtTime(value: number, at: number) { this.target = value; this.events.push({ kind: 'exponential', value, at }); return this; }
  cancelScheduledValues() { return this; }
}
class FakeNode {
  gain = new FakeParam(1);
  frequency = new FakeParam(0);
  Q = new FakeParam(0);
  type = '';
  buffer: unknown = null;
  loop = false;
  started = false;
  stopped = false;
  stopAt = 0;
  connect<T>(next: T): T { return next; }
  disconnect() {}
  start() { this.started = true; }
  stop(at = 0) { this.stopped = true; this.stopAt = at; }
}

const contexts: FakeContext[] = [];

class FakeContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode();
  gains: FakeNode[] = [];
  oscillators: FakeNode[] = [];
  sources: FakeNode[] = [];
  constructor() { contexts.push(this); }
  createGain() { const node = new FakeNode(); this.gains.push(node); return node; }
  createOscillator() { const node = new FakeNode(); this.oscillators.push(node); return node; }
  createBufferSource() { const node = new FakeNode(); this.sources.push(node); return node; }
  createBiquadFilter() { return new FakeNode(); }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}

type VoiceSounds = typeof import('@/lib/voiceSounds');

/** The room-tone level is the last gain built when the ambient starts. */
const ambientLevel = (ctx: FakeContext) => ctx.gains[ctx.gains.length - 1]!;

describe('voiceSounds', () => {
  let sounds: VoiceSounds;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    contexts.length = 0;
    audioState.volume = 1;
    audioState.disco = false;
    audioState.volumeListeners.length = 0;
    audioState.discoListeners.length = 0;
    vi.stubGlobal('window', { AudioContext: FakeContext });
    sounds = await import('@/lib/voiceSounds');
  });

  afterEach(() => {
    sounds.resetVoiceSoundsForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('is a silent no-op without Web Audio', async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const bare = await import('@/lib/voiceSounds');
    const onDone = vi.fn();
    expect(() => {
      bare.primeVoiceSounds();
      bare.playVoiceConnect(onDone);
      bare.startVoiceAmbient();
      bare.playVoiceAction();
      bare.playVoiceHangup();
      bare.stopVoiceSounds();
    }).not.toThrow();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('fades the room tone in under the tail of the connect chime', () => {
    sounds.primeVoiceSounds();
    sounds.playVoiceConnect(sounds.startVoiceAmbient);
    const ctx = contexts[0]!;
    expect(ctx.oscillators.filter((osc) => osc.started)).toHaveLength(6);
    expect(ctx.sources).toHaveLength(0);

    vi.runOnlyPendingTimers();
    expect(ctx.sources[0]?.loop).toBe(true);
    expect(ambientLevel(ctx).gain.target).toBeCloseTo(VOICE_SOUND_TOKENS.ambient.gain);
  });

  it('ducks under agent speech, yields to disco, and stays quiet after the call ends', () => {
    sounds.startVoiceAmbient();
    const ctx = contexts[0]!;
    const level = ambientLevel(ctx);
    const { gain, duckRatio } = VOICE_SOUND_TOKENS.ambient;

    sounds.duckVoiceAmbient(true);
    expect(level.gain.target).toBeCloseTo(gain * duckRatio);
    sounds.duckVoiceAmbient(false);
    vi.advanceTimersByTime(VOICE_SOUND_TOKENS.ambient.duckHoldMs);
    expect(level.gain.target).toBeCloseTo(gain);

    audioState.disco = true;
    audioState.discoListeners.forEach((listener) => listener(true));
    expect(level.gain.target).toBe(0);
    audioState.disco = false;
    audioState.discoListeners.forEach((listener) => listener(false));
    expect(level.gain.target).toBeCloseTo(gain);

    sounds.stopVoiceSounds();
    expect(level.gain.target).toBe(0);
    expect(audioState.discoListeners).toHaveLength(0);
    expect(audioState.volumeListeners).toHaveLength(0);
    vi.runAllTimers();
    expect(ctx.sources[0]?.stopped).toBe(true);
    expect(ctx.state).toBe('suspended');
  });

  it('holds the duck through speech gaps, then releases slowly after uninterrupted quiet', () => {
    sounds.startVoiceAmbient();
    const level = ambientLevel(contexts[0]!).gain;
    const { gain, duckRatio, duckHoldMs, duckAttackSec, duckReleaseSec } = VOICE_SOUND_TOKENS.ambient;
    sounds.duckVoiceAmbient(true);
    expect(level.events.at(-1)?.constant).toBeCloseTo(duckAttackSec / 3);

    sounds.duckVoiceAmbient(false);
    vi.advanceTimersByTime(duckHoldMs - 1);
    expect(level.target).toBeCloseTo(gain * duckRatio);
    sounds.duckVoiceAmbient(true);
    vi.advanceTimersByTime(duckHoldMs);
    expect(level.target).toBeCloseTo(gain * duckRatio);

    sounds.duckVoiceAmbient(false);
    vi.advanceTimersByTime(100);
    sounds.duckVoiceAmbient(false);
    vi.advanceTimersByTime(duckHoldMs - 101);
    expect(level.target).toBeCloseTo(gain * duckRatio);
    vi.advanceTimersByTime(1);
    expect(level.target).toBeCloseTo(gain);
    expect(level.events.at(-1)?.constant).toBeCloseTo(duckReleaseSec / 3);
  });

  it('cancels a pending duck release on stop and fades before stopping the ambient source', () => {
    sounds.startVoiceAmbient();
    const ctx = contexts[0]!;
    const level = ambientLevel(ctx).gain;
    sounds.duckVoiceAmbient(true);
    sounds.duckVoiceAmbient(false);
    sounds.stopVoiceSounds();
    const count = level.events.length;
    expect(level.events.at(-1)?.constant).toBeCloseTo(VOICE_SOUND_TOKENS.ambient.fadeOutSec / 3);
    vi.advanceTimersByTime(VOICE_SOUND_TOKENS.ambient.duckHoldMs);
    expect(level.events).toHaveLength(count);
    expect(level.target).toBe(0);
    expect(ctx.sources[0]?.stopped).toBe(false);
    vi.advanceTimersByTime(VOICE_SOUND_TOKENS.ambient.fadeOutSec * 1000 + 100);
    expect(ctx.sources[0]?.stopped).toBe(true);
  });

  it('rate-limits action ticks without postponing the next allowed tick', () => {
    sounds.playVoiceAction();
    const ctx = contexts[0]!;
    expect(ctx.oscillators).toHaveLength(1);
    expect(ctx.gains.at(-1)?.gain.events).toContainEqual(expect.objectContaining({ kind: 'linear', value: VOICE_SOUND_TOKENS.action.peakGain }));
    vi.advanceTimersByTime(VOICE_SOUND_TOKENS.action.minIntervalMs - 1);
    sounds.playVoiceAction();
    expect(ctx.oscillators).toHaveLength(1);
    vi.advanceTimersByTime(1);
    sounds.playVoiceAction();
    expect(ctx.oscillators).toHaveLength(2);
  });

  it.each(['connect', 'hangup', 'action'] as const)('uses click-free attack and decay envelopes for %s', (cue) => {
    if (cue === 'connect') sounds.playVoiceConnect();
    if (cue === 'hangup') sounds.playVoiceHangup();
    if (cue === 'action') sounds.playVoiceAction();
    const ctx = contexts[0]!;
    const envelopes = ctx.gains.filter(node => node.gain.events.some(event => event.kind === 'linear'));
    expect(envelopes.length).toBeGreaterThan(0);
    for (const { gain } of envelopes) {
      const [start, attack, decay] = gain.events;
      expect(start).toMatchObject({ kind: 'set', value: 0 });
      expect(attack?.kind).toBe('linear');
      expect(attack!.at - start!.at).toBeGreaterThanOrEqual(0.004 - Number.EPSILON);
      expect(decay).toMatchObject({ kind: 'exponential', value: 0.0001 });
      expect(ctx.oscillators.some(osc => Math.abs(osc.stopAt - decay!.at - 0.05) < Number.EPSILON)).toBe(true);
    }
  });
  it('follows the voiceAgent volume while active', () => {
    audioState.volume = 0.5;
    sounds.startVoiceAmbient();
    const out = contexts[0]!.gains[0]!;
    expect(out.gain.value).toBe(0.5);

    audioState.volumeListeners.forEach((listener) => listener(0.2));
    expect(out.gain.target).toBe(0.2);
  });
});
