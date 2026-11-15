import {
  getDiscoActiveSync,
  getEffectiveAudioCategoryVolumeSync,
  subscribeAudioCategoryVolume,
  subscribeDiscoActive,
} from '@/hooks/useStickers';
import { VOICE_SOUND_TOKENS as T } from '@/lib/designTokens';

/**
 * Voice-call sound cues, synthesized with Web Audio: a rising chime on connect, a falling chime
 * on hang-up, a soft tick when the agent acts, and a quiet breathing room-tone while the call is
 * live. The room tone ducks under agent speech and steps aside for disco mode.
 */

interface Engine {
  ctx: AudioContext;
  out: GainNode;
  ambient: GainNode | null;
  ambientSource: AudioScheduledSourceNode[];
}

let engine: Engine | null = null;
let ambientRequested = false;
let ducked = false;
let duckHoldTimer: ReturnType<typeof setTimeout> | null = null;
let lastActionAt = -Infinity;
let volumeUnsubscribe: (() => void) | null = null;
let discoUnsubscribe: (() => void) | null = null;
let connectTimer: ReturnType<typeof setTimeout> | null = null;
let ambientStopTimer: ReturnType<typeof setTimeout> | null = null;
let suspendTimer: ReturnType<typeof setTimeout> | null = null;

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function createContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
}

function ensureEngine(): Engine | null {
  if (engine) {
    if (suspendTimer) {
      clearTimeout(suspendTimer);
      suspendTimer = null;
    }
    if (engine.ctx.state === 'suspended') void engine.ctx.resume().catch(() => {});
    return engine;
  }
  const ctx = createContext();
  if (!ctx) return null;
  const out = ctx.createGain();
  out.gain.value = clamp01(getEffectiveAudioCategoryVolumeSync('voiceAgent'));
  out.connect(ctx.destination);
  engine = { ctx, out, ambient: null, ambientSource: [] };
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return engine;
}

function rampTo(param: AudioParam, target: number, ctx: AudioContext, timeConstantSec: number): void {
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.setTargetAtTime(target, now, Math.max(0.001, timeConstantSec / 3));
}

function ensureSubscriptions(): void {
  volumeUnsubscribe ??= subscribeAudioCategoryVolume('voiceAgent', (volume) => {
    if (engine) rampTo(engine.out.gain, clamp01(volume), engine.ctx, T.volumeRampSec);
  });
  discoUnsubscribe ??= subscribeDiscoActive(() => updateAmbientLevel(T.ambient.fadeInSec));
}

function releaseSubscriptions(): void {
  volumeUnsubscribe?.();
  volumeUnsubscribe = null;
  discoUnsubscribe?.();
  discoUnsubscribe = null;
}

/** Suspend the audio thread once nothing is audible, so an ended call costs no battery. */
function scheduleIdleSuspend(afterSec: number): void {
  if (!engine || ambientRequested) return;
  if (suspendTimer) clearTimeout(suspendTimer);
  suspendTimer = setTimeout(() => {
    suspendTimer = null;
    if (engine && !ambientRequested) void engine.ctx.suspend().catch(() => {});
  }, afterSec * 1000 + T.idleSuspendMs);
}

function ambientTarget(): number {
  if (!ambientRequested || getDiscoActiveSync()) return 0;
  return T.ambient.gain * (ducked ? T.ambient.duckRatio : 1);
}

function updateAmbientLevel(timeSec: number): void {
  if (!engine?.ambient) return;
  rampTo(engine.ambient.gain, ambientTarget(), engine.ctx, timeSec);
}

/** White noise through a steep low-pass, breathing slowly: a seamless, near-subliminal room tone. */
function buildAmbient(e: Engine): void {
  const { ctx } = e;
  const length = Math.floor(ctx.sampleRate * 2);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const lowA = ctx.createBiquadFilter();
  const lowB = ctx.createBiquadFilter();
  for (const filter of [lowA, lowB]) {
    filter.type = 'lowpass';
    filter.frequency.value = T.ambient.lowpassHz;
    filter.Q.value = 0.5;
  }
  const breath = ctx.createGain();
  breath.gain.value = 1;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = T.ambient.breathHz;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = T.ambient.breathDepth;
  lfo.connect(lfoDepth).connect(breath.gain);

  const level = ctx.createGain();
  level.gain.value = 0;
  noise.connect(lowA).connect(lowB).connect(breath).connect(level).connect(e.out);
  noise.start();
  lfo.start();
  e.ambient = level;
  e.ambientSource = [noise, lfo];
}

function teardownAmbient(e: Engine): void {
  for (const source of e.ambientSource) {
    try { source.stop(); } catch { /* already stopped */ }
  }
  e.ambient?.disconnect();
  e.ambient = null;
  e.ambientSource = [];
}

/** A soft mallet note: fundamental plus two quiet partials, fast attack, exponential decay. */
function playNote(e: Engine, bus: AudioNode, hz: number, at: number): void {
  const { ctx } = e;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(T.chime.peakGain, at + T.chime.attackSec);
  env.gain.exponentialRampToValueAtTime(0.0001, at + T.chime.decaySec);
  env.connect(bus);
  for (const [ratio, gain] of [[1, 1], [2, 0.22], [3, 0.06]] as const) {
    const osc = ctx.createOscillator();
    osc.frequency.value = hz * ratio;
    const partial = ctx.createGain();
    partial.gain.value = gain;
    osc.connect(partial).connect(env);
    osc.start(at);
    osc.stop(at + T.chime.decaySec + 0.05);
  }
}

/** Returns the chime length in seconds, or 0 when audio is unavailable. */
function playChime(notes: readonly number[]): number {
  const e = ensureEngine();
  if (!e) return 0;
  ensureSubscriptions();
  const bus = e.ctx.createBiquadFilter();
  bus.type = 'lowpass';
  bus.frequency.value = T.chime.lowpassHz;
  bus.connect(e.out);
  const start = e.ctx.currentTime + 0.01;
  notes.forEach((hz, index) => playNote(e, bus, hz, start + index * T.chime.noteGapSec));
  const length = (notes.length - 1) * T.chime.noteGapSec + T.chime.decaySec;
  setTimeout(() => bus.disconnect(), (length + 0.2) * 1000);
  return length;
}

/** Create and resume the context inside the user's click so later cues are allowed to play. */
export function primeVoiceSounds(): void {
  ensureEngine();
}

export function startVoiceAmbient(): void {
  const e = ensureEngine();
  if (!e) return;
  ambientRequested = true;
  ensureSubscriptions();
  if (ambientStopTimer) {
    clearTimeout(ambientStopTimer);
    ambientStopTimer = null;
  }
  if (!e.ambient) buildAmbient(e);
  updateAmbientLevel(T.ambient.fadeInSec);
}

/** Keep the room tone down through short gaps between spoken sentences. */
export function duckVoiceAmbient(shouldDuck: boolean): void {
  if (shouldDuck) {
    if (duckHoldTimer) clearTimeout(duckHoldTimer);
    duckHoldTimer = null;
    if (ducked) return;
    ducked = true;
    updateAmbientLevel(T.ambient.duckAttackSec);
  } else if (ducked && !duckHoldTimer) {
    duckHoldTimer = setTimeout(() => {
      duckHoldTimer = null;
      ducked = false;
      updateAmbientLevel(T.ambient.duckReleaseSec);
    }, T.ambient.duckHoldMs);
  }
}

/** Connect chime; `onDone` runs as the chime settles so the room tone fades in underneath it. */
export function playVoiceConnect(onDone?: () => void): void {
  if (connectTimer) clearTimeout(connectTimer);
  const length = playChime(T.chime.connect);
  if (!onDone) return;
  if (length === 0) {
    onDone();
    return;
  }
  connectTimer = setTimeout(() => {
    connectTimer = null;
    onDone();
  }, length * 500);
}

export function playVoiceHangup(): void {
  if (connectTimer) {
    clearTimeout(connectTimer);
    connectTimer = null;
  }
  playChime(T.chime.hangup);
}

export function playVoiceAction(): void {
  const now = performance.now();
  if (now - lastActionAt < T.action.minIntervalMs) return;
  const e = ensureEngine();
  if (!e) return;
  lastActionAt = now;
  ensureSubscriptions();
  const { ctx } = e;
  const at = ctx.currentTime + 0.005;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(T.action.startHz, at);
  osc.frequency.exponentialRampToValueAtTime(T.action.endHz, at + T.action.glideSec);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(T.action.peakGain, at + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, at + T.action.decaySec);
  osc.connect(env).connect(e.out);
  osc.start(at);
  osc.stop(at + T.action.decaySec + 0.05);
}

/** Fade the room tone out; one-shot chimes (like the hang-up) finish naturally. */
export function stopVoiceSounds(): void {
  ambientRequested = false;
  ducked = false;
  if (duckHoldTimer) clearTimeout(duckHoldTimer);
  duckHoldTimer = null;
  lastActionAt = -Infinity;
  if (connectTimer) {
    clearTimeout(connectTimer);
    connectTimer = null;
  }
  releaseSubscriptions();
  const e = engine;
  if (!e) return;
  updateAmbientLevel(T.ambient.fadeOutSec);
  if (ambientStopTimer) clearTimeout(ambientStopTimer);
  ambientStopTimer = setTimeout(() => {
    ambientStopTimer = null;
    if (!ambientRequested) teardownAmbient(e);
  }, T.ambient.fadeOutSec * 1000 + 100);
  scheduleIdleSuspend(Math.max(T.ambient.fadeOutSec, T.chime.decaySec * 2));
}

export function resetVoiceSoundsForTests(): void {
  stopVoiceSounds();
  for (const timer of [ambientStopTimer, suspendTimer]) {
    if (timer) clearTimeout(timer);
  }
  ambientStopTimer = null;
  suspendTimer = null;
  if (engine) teardownAmbient(engine);
  engine = null;
}
