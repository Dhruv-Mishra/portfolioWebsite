import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VOICE_SOUND_TOKENS as T } from '@/lib/designTokens';

const prefs = vi.hoisted(() => ({
  volume: 1,
  disco: false,
  volumeListeners: new Set<(volume: number) => void>(),
  discoListeners: new Set<(active: boolean) => void>(),
}));

vi.mock('@/hooks/useStickers', () => ({
  getEffectiveAudioCategoryVolumeSync: () => prefs.volume,
  getDiscoActiveSync: () => prefs.disco,
  subscribeAudioCategoryVolume: (_category: string, listener: (volume: number) => void) => {
    prefs.volumeListeners.add(listener);
    return () => prefs.volumeListeners.delete(listener);
  },
  subscribeDiscoActive: (listener: (active: boolean) => void) => {
    prefs.discoListeners.add(listener);
    return () => prefs.discoListeners.delete(listener);
  },
}));

type Automation = { kind: 'set' | 'linear' | 'exponential' | 'target'; value: number; at: number; tau?: number };

/** Evaluates scheduled automation the way the audio thread would, so tests can sample real curves. */
class FakeParam {
  private events: Automation[] = [];
  constructor(private initial: number, private readonly ctx: FakeContext) {}
  get value() { return this.at(this.ctx.currentTime); }
  set value(value: number) { this.initial = value; }
  setValueAtTime(value: number, at: number) { return this.add({ kind: 'set', value, at }); }
  linearRampToValueAtTime(value: number, at: number) { return this.add({ kind: 'linear', value, at }); }
  exponentialRampToValueAtTime(value: number, at: number) { return this.add({ kind: 'exponential', value, at }); }
  setTargetAtTime(value: number, at: number, tau: number) { return this.add({ kind: 'target', value, at, tau }); }
  cancelScheduledValues(at: number) { this.events = this.events.filter(event => event.at < at); return this; }
  at(time: number): number {
    let value = this.initial;
    let from = 0;
    for (const [index, event] of this.events.entries()) {
      if (event.kind === 'linear' || event.kind === 'exponential') {
        if (time < event.at) {
          const progress = Math.max(0, (time - from) / (event.at - from));
          return event.kind === 'linear' ? value + (event.value - value) * progress : value * (event.value / value) ** progress;
        }
      } else if (time < event.at) {
        return value;
      }
      if (event.kind === 'target') {
        const next = this.events[index + 1];
        const until = Math.min(time, next?.at ?? Infinity);
        value = event.value + (value - event.value) * Math.exp(-(until - event.at) / event.tau!);
        if (!next || time < next.at) return value;
      } else {
        value = event.value;
      }
      from = event.at;
    }
    return value;
  }
  private add(event: Automation) {
    this.events.push(event);
    this.events.sort((a, b) => a.at - b.at);
    return this;
  }
}

class FakeNode {
  readonly gain: FakeParam;
  readonly frequency: FakeParam;
  readonly Q: FakeParam;
  readonly playbackRate: FakeParam;
  readonly outputs = new Set<unknown>();
  type = '';
  buffer: unknown = null;
  loop = false;
  startAt: number | null = null;
  stopAt: number | null = null;
  onended: (() => void) | null = null;
  constructor(readonly ctx: FakeContext, readonly kind: string) {
    this.gain = new FakeParam(1, ctx);
    this.frequency = new FakeParam(440, ctx);
    this.Q = new FakeParam(1, ctx);
    this.playbackRate = new FakeParam(1, ctx);
  }
  connect<N>(target: N): N { this.outputs.add(target); return target; }
  disconnect() { this.outputs.clear(); }
  start(at = 0) { this.startAt = at; }
  stop(at = 0) { this.stopAt = at; }
}

const contexts: FakeContext[] = [];

class FakeContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 8000;
  readonly nodes: FakeNode[] = [];
  readonly destination = new FakeNode(this, 'destination');
  readonly resume = vi.fn(async () => { this.state = 'running'; });
  readonly suspend = vi.fn(async () => { this.state = 'suspended'; });
  constructor() { contexts.push(this); }
  createGain() { return this.node('gain'); }
  createOscillator() { return this.node('oscillator'); }
  createBufferSource() { return this.node('buffer'); }
  createBiquadFilter() { return this.node('biquad'); }
  createConvolver() { return this.node('convolver'); }
  createBuffer(channels: number, length: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { duration: length / this.sampleRate, getChannelData: (channel: number) => data[channel]! };
  }
  /** Advance the audio clock, firing `ended` for sources whose stop time has passed. */
  advance(seconds: number) {
    this.currentTime += seconds;
    for (const node of this.nodes) {
      if (node.stopAt !== null && node.stopAt <= this.currentTime && node.onended) {
        const ended = node.onended;
        node.onended = null;
        ended();
      }
    }
  }
  get out() { return this.nodes.find(node => node.kind === 'gain' && node.outputs.has(this.destination))!; }
  /** Nodes still wired into the output bus. */
  get feeding() { return this.nodes.filter(node => node.outputs.has(this.out)).map(node => node.kind); }
  oscillators() { return this.nodes.filter(node => node.kind === 'oscillator'); }
  private node(kind: string) {
    const node = new FakeNode(this, kind);
    this.nodes.push(node);
    return node;
  }
}

type VoiceSounds = typeof import('@/lib/voiceSounds');

const envelopeOf = (osc: FakeNode) => [...osc.outputs][0] as FakeNode;
const lastGain = (ctx: FakeContext) => ctx.nodes.filter(node => node.kind === 'gain').at(-1)!;
const cueBuses = (ctx: FakeContext) => ctx.nodes.filter(node => node.kind === 'gain' && node.outputs.has(ctx.out));

describe('voiceSounds', () => {
  let sounds: VoiceSounds;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    contexts.length = 0;
    prefs.volume = 1;
    prefs.disco = false;
    prefs.volumeListeners.clear();
    prefs.discoListeners.clear();
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
    expect(() => {
      bare.playVoiceConnect();
      bare.startVoiceAmbient();
      bare.duckVoiceAmbient(true);
      bare.playVoiceAction();
      bare.playVoiceHangup();
      bare.stopVoiceSounds();
    }).not.toThrow();
  });

  it.each([
    ['connect', 'playVoiceConnect', T.chime.connect],
    ['hangup', 'playVoiceHangup', T.chime.hangup],
  ] as const)('plays the %s chime as notes that rise from silence and stop only once inaudible', (_cue, play, notes) => {
    sounds[play]();
    const ctx = contexts[0]!;
    const fundamentals = ctx.oscillators()
      .filter(osc => notes.some(hz => osc.frequency.value === hz))
      .sort((a, b) => a.startAt! - b.startAt!)
      .map(osc => osc.frequency.value);
    expect(fundamentals).toEqual([...notes]);
    for (const osc of ctx.oscillators()) {
      const envelope = envelopeOf(osc).gain;
      expect(osc.startAt).toBeGreaterThan(ctx.currentTime);
      expect(envelope.at(osc.startAt!)).toBe(0);
      expect(envelope.at(osc.startAt! + T.chime.attackSec)).toBeLessThanOrEqual(T.chime.peak);
      expect(envelope.at(osc.stopAt!)).toBeLessThan(T.chime.peak * 1e-3);
    }
  });

  it('disconnects each cue once its last voice ends', () => {
    sounds.playVoiceConnect();
    sounds.playVoiceAction();
    const ctx = contexts[0]!;
    expect(ctx.feeding).toEqual(['convolver', 'gain', 'gain']);
    ctx.advance(10);
    expect(ctx.feeding).toEqual(['convolver']);
  });

  it('fades a still-ringing chime out instead of stacking a second one on it', () => {
    sounds.playVoiceConnect();
    const ctx = contexts[0]!;
    const [connectBus] = cueBuses(ctx);
    ctx.advance(0.2);
    sounds.playVoiceHangup();
    expect(connectBus!.gain.at(ctx.currentTime)).toBe(1);
    expect(connectBus!.gain.at(ctx.currentTime + T.chime.stealSec / 2)).toBeCloseTo(0.5);
    expect(connectBus!.gain.at(ctx.currentTime + T.chime.stealSec)).toBe(0);
    expect(cueBuses(ctx)).toHaveLength(2);
  });

  it('rate-limits action ticks without postponing the next allowed tick', () => {
    sounds.playVoiceAction();
    const ctx = contexts[0]!;
    vi.advanceTimersByTime(T.action.minIntervalMs - 1);
    sounds.playVoiceAction();
    expect(ctx.oscillators()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    sounds.playVoiceAction();
    expect(ctx.oscillators()).toHaveLength(2);
    const [tick] = ctx.oscillators();
    expect(tick!.frequency.at(tick!.startAt! + T.action.glideSec)).toBeCloseTo(T.action.toHz);
    expect(envelopeOf(tick!).gain.at(tick!.stopAt!)).toBeLessThan(T.action.peak * 1e-3);
  });

  it('fades the room tone in after the chime, ducks under speech, and yields to disco', () => {
    sounds.startVoiceAmbient();
    const ctx = contexts[0]!;
    const level = lastGain(ctx).gain;
    const { delaySec, fadeInTau, duckAttackTau, duckReleaseTau, duckHoldMs, duckRatio } = T.ambient;
    const settled = (tau: number) => level.at(ctx.currentTime + tau * 8);
    expect(level.at(delaySec)).toBe(0);
    expect(level.at(delaySec + fadeInTau * 8)).toBeCloseTo(T.ambient.level);
    ctx.advance(delaySec + fadeInTau * 8);

    sounds.duckVoiceAmbient(true);
    expect(settled(duckAttackTau)).toBeCloseTo(T.ambient.level * duckRatio);
    sounds.duckVoiceAmbient(false);
    vi.advanceTimersByTime(duckHoldMs - 1);
    sounds.duckVoiceAmbient(true);
    vi.advanceTimersByTime(duckHoldMs);
    expect(settled(duckReleaseTau)).toBeCloseTo(T.ambient.level * duckRatio);
    sounds.duckVoiceAmbient(false);
    vi.advanceTimersByTime(duckHoldMs);
    expect(settled(duckReleaseTau)).toBeCloseTo(T.ambient.level);

    prefs.disco = true;
    prefs.discoListeners.forEach(listener => listener(true));
    expect(settled(fadeInTau)).toBeCloseTo(0);
    prefs.disco = false;
    prefs.discoListeners.forEach(listener => listener(false));
    expect(settled(fadeInTau)).toBeCloseTo(T.ambient.level);
  });

  it('fades to exact silence before stopping, then suspends the idle context', () => {
    sounds.startVoiceAmbient();
    const ctx = contexts[0]!;
    const level = lastGain(ctx);
    ctx.advance(2);
    sounds.duckVoiceAmbient(true);
    sounds.duckVoiceAmbient(false);
    sounds.stopVoiceSounds();
    const end = ctx.currentTime + T.ambient.fadeOutSec;
    expect(level.gain.at(ctx.currentTime)).toBeGreaterThan(0);
    expect(level.gain.at(end)).toBe(0);
    const sources = ctx.nodes.filter(node => node.startAt !== null);
    expect(sources.every(source => source.stopAt! > end)).toBe(true);

    vi.advanceTimersByTime(T.ambient.duckHoldMs);
    expect(level.gain.at(end)).toBe(0);
    ctx.advance(1);
    expect(ctx.feeding).toEqual(['convolver']);
    expect(ctx.suspend).not.toHaveBeenCalled();
    vi.advanceTimersByTime(T.idleSuspendMs + 1000);
    expect(ctx.suspend).toHaveBeenCalledOnce();

    ctx.resume.mockClear();
    sounds.playVoiceAction();
    expect(ctx.resume).toHaveBeenCalledOnce();
  });

  it('starts a fresh, unducked bed when a call restarts during the fade-out', () => {
    sounds.startVoiceAmbient();
    const ctx = contexts[0]!;
    const first = lastGain(ctx);
    ctx.advance(2);
    sounds.duckVoiceAmbient(true);
    sounds.stopVoiceSounds();
    ctx.advance(0.1);
    sounds.startVoiceAmbient();
    const second = lastGain(ctx);
    expect(second).not.toBe(first);
    expect(first.gain.at(2 + T.ambient.fadeOutSec)).toBe(0);
    expect(second.gain.at(ctx.currentTime + T.ambient.delaySec + T.ambient.fadeInTau * 8)).toBeCloseTo(T.ambient.level);
    vi.advanceTimersByTime(60_000);
    expect(ctx.suspend).not.toHaveBeenCalled();
  });

  it('follows the voiceAgent volume, including changes made between calls', () => {
    prefs.volume = 0.5;
    sounds.playVoiceConnect();
    const ctx = contexts[0]!;
    expect(ctx.out.gain.value).toBe(0.5);
    prefs.volumeListeners.forEach(listener => listener(0.2));
    expect(ctx.out.gain.at(ctx.currentTime + T.volumeTau * 8)).toBeCloseTo(0.2);

    ctx.advance(10);
    vi.runAllTimers();
    prefs.volumeListeners.forEach(listener => listener(0));
    ctx.advance(1);
    sounds.playVoiceConnect();
    expect(ctx.out.gain.value).toBeCloseTo(0);
  });
});
