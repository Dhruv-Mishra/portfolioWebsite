import {
  getDiscoActiveSync,
  getEffectiveAudioCategoryVolumeSync,
  subscribeAudioCategoryVolume,
  subscribeDiscoActive,
} from '@/hooks/useStickers';
import { VOICE_SOUND_TOKENS as T } from '@/lib/designTokens';

/**
 * Voice-call cues synthesized with Web Audio: a rising chime on connect, a falling chime on
 * hang-up, a soft tick when the agent acts, and a breathing room tone that ducks under speech
 * and yields to disco. Every sound starts and ends on an envelope, so nothing clicks.
 */

/** Tones stop this many time constants into their decay (about -78 dB), far below audibility. */
const TAIL_TAUS = 9;

interface Bed {
  level: GainNode;
  sources: AudioScheduledSourceNode[];
}

interface Engine {
  ctx: AudioContext;
  out: GainNode;
  send: GainNode;
  noise: AudioBuffer | null;
  bed: Bed | null;
  chime: GainNode | null;
  /** Audio time after which nothing scheduled is still audible. */
  quietAt: number;
  unsubscribe: () => void;
}

interface Voice {
  osc: OscillatorNode;
  end: number;
}

let engine: Engine | null = null;
let ducked = false;
let duckTimer: ReturnType<typeof setTimeout> | null = null;
let suspendTimer: ReturnType<typeof setTimeout> | null = null;
let lastActionAt = -Infinity;

function clampVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0;
}

/** Start a new automation segment from wherever the param is now, so a change never steps. */
function hold(param: AudioParam, at: number): void {
  param.cancelScheduledValues(at);
  param.setValueAtTime(param.value, at);
}

function glide(param: AudioParam, value: number, at: number, tau: number): void {
  hold(param, at);
  param.setTargetAtTime(value, at, tau);
}

function fadeOut(param: AudioParam, at: number, seconds: number): void {
  hold(param, at);
  param.linearRampToValueAtTime(0, at + seconds);
}

/** Exponentially decaying, darkened stereo noise: a small room for the cues to ring into. */
function roomImpulse(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.round(ctx.sampleRate * T.room.seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    let dark = 0;
    for (let i = 0; i < length; i++) {
      dark += (Math.random() * 2 - 1 - dark) * T.room.damping;
      const taper = Math.min(1, (length - i) / (length * 0.1));
      data[i] = dark * taper * Math.exp(-i / (ctx.sampleRate * T.room.decayTau));
    }
  }
  return impulse;
}

function createEngine(): Engine | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  const out = ctx.createGain();
  out.gain.value = clampVolume(getEffectiveAudioCategoryVolumeSync('voiceAgent'));
  out.connect(ctx.destination);
  const send = ctx.createGain();
  send.gain.value = T.room.send;
  const room = ctx.createConvolver();
  room.buffer = roomImpulse(ctx);
  send.connect(room).connect(out);
  const offVolume = subscribeAudioCategoryVolume('voiceAgent', (volume) => {
    glide(out.gain, clampVolume(volume), ctx.currentTime, T.volumeTau);
  });
  const offDisco = subscribeDiscoActive(() => setBedLevel(T.ambient.fadeInTau));
  return {
    ctx,
    out,
    send,
    noise: null,
    bed: null,
    chime: null,
    quietAt: 0,
    unsubscribe: () => {
      offVolume();
      offDisco();
    },
  };
}

function ensureEngine(): Engine | null {
  engine ??= createEngine();
  if (!engine) return null;
  if (suspendTimer) {
    clearTimeout(suspendTimer);
    suspendTimer = null;
  }
  // Also undoes a suspend that is still in flight; the first call runs inside the user's click.
  void engine.ctx.resume().catch(() => {});
  return engine;
}

/** Suspend the audio thread once every scheduled tail has died away, so an idle page costs no battery. */
function settle(e: Engine, until: number): void {
  e.quietAt = Math.max(e.quietAt, until);
  if (e.bed) return;
  if (suspendTimer) clearTimeout(suspendTimer);
  const waitMs = Math.max(0, e.quietAt - e.ctx.currentTime) * 1000 + T.idleSuspendMs;
  suspendTimer = setTimeout(() => {
    suspendTimer = null;
    if (engine === e && !e.bed) void e.ctx.suspend().catch(() => {});
  }, waitMs);
}

/** One sine voice: linear attack from silence, exponential decay, stopped once inaudible. */
function tone(
  ctx: BaseAudioContext,
  bus: AudioNode,
  hz: number,
  at: number,
  peak: number,
  attackSec: number,
  tau: number,
): Voice {
  const osc = ctx.createOscillator();
  osc.frequency.value = hz;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(peak, at + attackSec);
  env.gain.setTargetAtTime(0, at + attackSec, tau);
  osc.connect(env).connect(bus);
  const end = at + attackSec + tau * TAIL_TAUS;
  osc.start(at);
  osc.stop(end);
  return { osc, end };
}

/** Play voices on a fresh bus (dry plus room send) that disconnects itself after the last voice. */
function playCue(e: Engine, voices: (bus: GainNode, at: number) => Voice[]): GainNode {
  const bus = e.ctx.createGain();
  bus.connect(e.out);
  bus.connect(e.send);
  const last = voices(bus, e.ctx.currentTime + T.leadSec).reduce((a, b) => (b.end > a.end ? b : a));
  last.osc.onended = () => bus.disconnect();
  settle(e, last.end + T.room.seconds);
  return bus;
}

function playChime(notes: readonly number[]): void {
  const e = ensureEngine();
  if (!e) return;
  const { ctx } = e;
  if (e.chime) fadeOut(e.chime.gain, ctx.currentTime, T.chime.stealSec);
  e.chime = playCue(e, (bus, at) => notes.flatMap((hz, index) => T.chime.partials.map(([ratio, gain, tau]) => (
    tone(ctx, bus, hz * ratio, at + index * T.chime.noteGapSec, T.chime.peak * gain, T.chime.attackSec, tau)
  ))));
}

function bedTarget(): number {
  return getDiscoActiveSync() ? 0 : T.ambient.level * (ducked ? T.ambient.duckRatio : 1);
}

function setBedLevel(tau: number): void {
  if (engine?.bed) glide(engine.bed.level.gain, bedTarget(), engine.ctx.currentTime, tau);
}

/** Band-limited noise that breathes slowly: a seamless, barely-there room tone. */
function startBed(e: Engine): Bed {
  const { ctx } = e;
  if (!e.noise) {
    e.noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * T.ambient.loopSec), ctx.sampleRate);
    const data = e.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = T.ambient.highpassHz;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = T.ambient.lowpassHz;
  const breath = ctx.createGain();
  const lfo = ctx.createOscillator();
  lfo.frequency.value = T.ambient.breathHz;
  const depth = ctx.createGain();
  depth.gain.value = T.ambient.breathDepth;
  lfo.connect(depth).connect(breath.gain);
  const level = ctx.createGain();
  level.gain.value = 0;
  highpass.connect(lowpass).connect(breath).connect(level).connect(e.out);
  const sources: AudioScheduledSourceNode[] = [lfo];
  for (const rate of [1, T.ambient.driftRate]) {
    const noise = ctx.createBufferSource();
    noise.buffer = e.noise;
    noise.loop = true;
    noise.playbackRate.value = rate;
    noise.connect(highpass);
    sources.push(noise);
  }
  for (const source of sources) source.start();
  return { level, sources };
}

/** Connect chime. Call it from the user's click: it also creates and unlocks the audio context. */
export function playVoiceConnect(): void {
  playChime(T.chime.connect);
}

export function playVoiceHangup(): void {
  playChime(T.chime.hangup);
}

export function playVoiceAction(): void {
  const now = performance.now();
  if (now - lastActionAt < T.action.minIntervalMs) return;
  const e = ensureEngine();
  if (!e) return;
  lastActionAt = now;
  const { ctx } = e;
  playCue(e, (bus, at) => {
    const voice = tone(ctx, bus, T.action.fromHz, at, T.action.peak, T.action.attackSec, T.action.tau);
    voice.osc.frequency.setValueAtTime(T.action.fromHz, at);
    voice.osc.frequency.exponentialRampToValueAtTime(T.action.toHz, at + T.action.glideSec);
    return [voice];
  });
}

/** Fade the room tone in for a call; a no-op while it is already playing. */
export function startVoiceAmbient(): void {
  const e = ensureEngine();
  if (!e || e.bed) return;
  e.bed = startBed(e);
  glide(e.bed.level.gain, bedTarget(), e.ctx.currentTime + T.ambient.delaySec, T.ambient.fadeInTau);
}

export function duckVoiceAmbient(shouldDuck: boolean): void {
  if (shouldDuck) {
    if (duckTimer) clearTimeout(duckTimer);
    duckTimer = null;
    if (ducked) return;
    ducked = true;
    setBedLevel(T.ambient.duckAttackTau);
    return;
  }
  if (!ducked || duckTimer) return;
  duckTimer = setTimeout(() => {
    duckTimer = null;
    ducked = false;
    setBedLevel(T.ambient.duckReleaseTau);
  }, T.ambient.duckHoldMs);
}

/** Fade the room tone to silence and stop it; chimes that are already playing ring out. */
export function stopVoiceSounds(): void {
  ducked = false;
  if (duckTimer) clearTimeout(duckTimer);
  duckTimer = null;
  lastActionAt = -Infinity;
  const e = engine;
  const bed = e?.bed;
  if (!e || !bed) return;
  e.bed = null;
  const now = e.ctx.currentTime;
  fadeOut(bed.level.gain, now, T.ambient.fadeOutSec);
  for (const source of bed.sources) {
    source.onended = () => bed.level.disconnect();
    source.stop(now + T.ambient.fadeOutSec + T.leadSec);
  }
  settle(e, now + T.ambient.fadeOutSec);
}

export function resetVoiceSoundsForTests(): void {
  stopVoiceSounds();
  if (suspendTimer) clearTimeout(suspendTimer);
  suspendTimer = null;
  engine?.unsubscribe();
  engine = null;
}
