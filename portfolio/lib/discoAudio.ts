/**
 * discoAudio — procedural Web Audio disco loop.
 *
 * Four-on-the-floor at 120 BPM. 4-bar loop (~8s). Zero binary assets,
 * zero copyright risk, zero new deps. Starts ONLY on a user gesture
 * (the `sudo disco` action) so Safari/Chrome autoplay policies pass.
 *
 * Topology (per voice):
 *   kick:       Osc (sine) + pitch envelope (80→40 Hz) → gain env → master
 *   hiHat:      Noise buffer source → BP filter (7kHz Q=1.2) → short env → master
 *   bass:       Osc (sawtooth) → LP filter (420 Hz Q=6) → gain env → master
 *   pad:        Osc (triangle) x2 detuned → LP filter (1200 Hz) → slow swell → master
 *
 * master:       GainNode (default 0.22) → destination
 *
 * Scheduler:
 *   - Uses the standard "look-ahead" pattern (Chris Wilson). A JS timer fires
 *     every ~25ms and schedules any notes that fall within the next 100ms at
 *     precise AudioContext time. This keeps timing rock-solid even when the
 *     tab is throttled (up to the limits browsers enforce) and lets us cleanly
 *     stop by canceling the timer and tearing down nodes.
 *
 * Teardown:
 *   - stop() disconnects every node and nulls references. No setInterval
 *     leaks, no orphan oscillators. Calling stop() before start() is a no-op.
 *
 * Autoplay / failure:
 *   - If AudioContext creation throws (iOS privacy, policy, etc.) the module
 *     silently falls back to a no-op. The visuals don't depend on audio.
 */

type Nullable<T> = T | null;

const BPM = 120;
const BEATS_PER_BAR = 4;
const BARS = 4;
const BEAT_SEC = 60 / BPM;                  // 0.5s
const SUBDIV_PER_BEAT = 4;                  // 16th-note grid
const LOOP_LEN_BEATS = BARS * BEATS_PER_BAR;

// Scheduler constants (Chris Wilson pattern).
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.1;

// Bass motif — 4-bar walking line in Am pentatonic-ish territory.
// Values are MIDI note numbers. One step per beat (4 notes/bar × 4 bars = 16).
const BASS_LINE: ReadonlyArray<number> = [
  45, 45, 52, 52, // A2 A2 E3 E3
  44, 44, 52, 52, // Ab2 Ab2 E3 E3 (the ♭II chromatic pull is what makes disco)
  45, 45, 50, 50, // A2 A2 D3 D3
  43, 43, 50, 52, // G2 G2 D3 E3
];

// Helper — midi → Hz.
function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

function createContext(): Nullable<AudioContext> {
  if (typeof window === 'undefined') return null;
  const w = window as WebkitWindow;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

/** Build a short noise buffer reused by every hi-hat trigger. */
function buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const SECONDS = 0.25;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * SECONDS), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    // Slightly shaped white noise — fade-out so even without a gain env the
    // tail doesn't click.
    const t = i / data.length;
    data[i] = (Math.random() * 2 - 1) * (1 - t);
  }
  return buffer;
}

// ─── Voice synthesis helpers ───────────────────────────────────────────

/**
 * schedule-kick — 80→40 Hz sine swoop with a short percussive envelope.
 * Lives on its own osc/gain pair that auto-stops; no global state to leak.
 */
function scheduleKick(ctx: AudioContext, dest: AudioNode, time: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(90, time);
  osc.frequency.exponentialRampToValueAtTime(38, time + 0.12);

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.9, time + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);

  osc.connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + 0.32);
  // Auto-disconnect after stop to release memory promptly.
  osc.onended = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      /* ignore */
    }
  };
}

function scheduleHiHat(
  ctx: AudioContext,
  dest: AudioNode,
  noise: AudioBuffer,
  time: number,
  open: boolean,
): void {
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  src.buffer = noise;
  filter.type = 'bandpass';
  filter.frequency.value = open ? 6200 : 8200;
  filter.Q.value = 1.2;

  const peak = open ? 0.22 : 0.16;
  const tail = open ? 0.18 : 0.05;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(peak, time + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + tail);

  src.connect(filter).connect(gain).connect(dest);
  src.start(time);
  src.stop(time + tail + 0.05);
  src.onended = () => {
    try {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    } catch {
      /* ignore */
    }
  };
}

function scheduleBass(
  ctx: AudioContext,
  dest: AudioNode,
  midi: number,
  time: number,
  length: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(midiToHz(midi), time);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(420, time);
  filter.frequency.exponentialRampToValueAtTime(900, time + 0.08);
  filter.frequency.exponentialRampToValueAtTime(480, time + length);
  filter.Q.value = 6;

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.34, time + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.12, time + length * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + length);

  osc.connect(filter).connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + length + 0.05);
  osc.onended = () => {
    try {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    } catch {
      /* ignore */
    }
  };
}

/** Long swell pad — one event per bar. Two detuned triangles through a LP. */
function schedulePadSwell(ctx: AudioContext, dest: AudioNode, time: number, length: number): void {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc1.type = 'triangle';
  osc2.type = 'triangle';
  // A3 + A4 two octaves — gentle, consonant with the bass.
  osc1.frequency.value = midiToHz(57);
  osc2.frequency.value = midiToHz(69);
  osc2.detune.value = 6; // light beating for movement

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(700, time);
  filter.frequency.exponentialRampToValueAtTime(1400, time + length * 0.4);
  filter.frequency.exponentialRampToValueAtTime(700, time + length);
  filter.Q.value = 2;

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.08, time + length * 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + length);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain).connect(dest);

  osc1.start(time);
  osc2.start(time);
  osc1.stop(time + length + 0.1);
  osc2.stop(time + length + 0.1);
  let ended = 0;
  const cleanup = (): void => {
    ended++;
    if (ended < 2) return;
    try {
      osc1.disconnect();
      osc2.disconnect();
      filter.disconnect();
      gain.disconnect();
    } catch {
      /* ignore */
    }
  };
  osc1.onended = cleanup;
  osc2.onended = cleanup;
}

// ─── Engine ───────────────────────────────────────────────────────────
interface EngineState {
  ctx: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
  /** Scheduler bookkeeping. */
  currentStep: number;              // 0..(LOOP_LEN_BEATS * SUBDIV_PER_BEAT - 1)
  nextNoteTime: number;             // AudioContext time of the next sub-division
  timerId: number | null;
  /** Visibility pause flag — when true the scheduler parks until resumed. */
  paused: boolean;
  /** Flag consulted by the master gain ramp on stop() to avoid a click. */
  stopping: boolean;
}

let engine: Nullable<EngineState> = null;

/** Fine-grained volume setter — used by the mute toggle. */
function setMasterGain(state: EngineState, value: number, t: number): void {
  const { master, ctx } = state;
  const now = Math.max(t, ctx.currentTime);
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(value, now + 0.08);
}

function scheduleSubdivision(state: EngineState, step: number, time: number): void {
  const beatInLoop = step / SUBDIV_PER_BEAT;
  const subdivInBeat = step % SUBDIV_PER_BEAT;

  // KICK — every beat (four-on-the-floor).
  if (subdivInBeat === 0) {
    scheduleKick(state.ctx, state.master, time);
  }

  // CLOSED HI-HAT — on the "and" offbeat, i.e. SUBDIV_PER_BEAT / 2.
  if (subdivInBeat === SUBDIV_PER_BEAT / 2) {
    scheduleHiHat(state.ctx, state.master, state.noise, time, false);
  }

  // OPEN HI-HAT — once per bar on beat 4 offbeat for flavor.
  if (beatInLoop % BEATS_PER_BAR === 3 && subdivInBeat === SUBDIV_PER_BEAT / 2) {
    scheduleHiHat(state.ctx, state.master, state.noise, time, true);
  }

  // BASS — first sub of every beat.
  if (subdivInBeat === 0) {
    const idx = Math.floor(beatInLoop) % BASS_LINE.length;
    scheduleBass(state.ctx, state.master, BASS_LINE[idx], time, BEAT_SEC * 0.9);
  }

  // PAD — one long swell at the top of each bar, covering all 4 beats.
  if (subdivInBeat === 0 && beatInLoop % BEATS_PER_BAR === 0) {
    schedulePadSwell(state.ctx, state.master, time, BEAT_SEC * BEATS_PER_BAR * 0.96);
  }
}

function scheduler(state: EngineState): void {
  if (state.paused || state.stopping) return;
  const subdivSec = BEAT_SEC / SUBDIV_PER_BEAT;
  const totalSteps = LOOP_LEN_BEATS * SUBDIV_PER_BEAT;
  while (state.nextNoteTime < state.ctx.currentTime + SCHEDULE_AHEAD_SEC) {
    scheduleSubdivision(state, state.currentStep, state.nextNoteTime);
    state.nextNoteTime += subdivSec;
    state.currentStep = (state.currentStep + 1) % totalSteps;
  }
}

// ─── Public API ───────────────────────────────────────────────────────
export interface DiscoAudioHandle {
  /** Tear everything down and release memory. Safe to call multiple times. */
  stop: () => void;
  /** Toggle mute without losing scheduler state. */
  setMuted: (muted: boolean) => void;
  /** Pause the scheduler (and schedule no further notes). */
  pause: () => void;
  /** Resume the scheduler. */
  resume: () => void;
  /** True once the context is running. */
  isRunning: () => boolean;
}

export interface DiscoAudioOptions {
  /** Initial master gain. Default 0.22. */
  volume?: number;
  /** If true, start muted. */
  muted?: boolean;
}

const DEFAULT_VOLUME = 0.22;

/**
 * Start the disco loop. Returns a handle you MUST call stop() on when disco
 * ends. Subsequent calls return the existing handle — only one engine per
 * page is supported.
 *
 * Returns null if Web Audio isn't available (SSR, blocked, iOS private mode).
 */
export function startDiscoAudio(options: DiscoAudioOptions = {}): Nullable<DiscoAudioHandle> {
  // Idempotent — return the existing handle if one is live.
  if (engine !== null) {
    return makeHandle(engine);
  }
  const ctx = createContext();
  if (!ctx) return null;

  // Resume if the context was created suspended (Chrome/Safari autoplay policy).
  // The caller is expected to be invoked from a user gesture, so this is
  // allowed.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {
      /* ignore — we'll still try to schedule; worst case silence */
    });
  }

  const master = ctx.createGain();
  master.gain.value = options.muted ? 0 : (options.volume ?? DEFAULT_VOLUME);
  master.connect(ctx.destination);

  const state: EngineState = {
    ctx,
    master,
    noise: buildNoiseBuffer(ctx),
    currentStep: 0,
    nextNoteTime: ctx.currentTime + 0.08, // small lead-in so the first kick isn't ragged
    timerId: null,
    paused: false,
    stopping: false,
  };

  // Prime the look-ahead pump.
  const tick = (): void => {
    if (!engine) return;
    scheduler(engine);
  };
  state.timerId = window.setInterval(tick, LOOKAHEAD_MS);

  engine = state;
  return makeHandle(state);
}

function makeHandle(state: EngineState): DiscoAudioHandle {
  return {
    stop: () => stopInternal(state),
    setMuted: (muted: boolean) => {
      if (state.stopping) return;
      setMasterGain(state, muted ? 0 : DEFAULT_VOLUME, state.ctx.currentTime);
    },
    pause: () => {
      state.paused = true;
    },
    resume: () => {
      if (!state.paused || state.stopping) return;
      state.paused = false;
      // Re-anchor nextNoteTime so we don't fire a burst after resume.
      state.nextNoteTime = Math.max(state.nextNoteTime, state.ctx.currentTime + 0.08);
    },
    isRunning: () => state.ctx.state === 'running' && !state.paused && !state.stopping,
  };
}

function stopInternal(state: EngineState): void {
  if (state.stopping) return;
  state.stopping = true;
  if (state.timerId !== null) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  // Detach from the module-level singleton immediately so a subsequent
  // startDiscoAudio() call spins up a fresh context instead of handing back
  // this draining one. Teardown still completes on its own timer.
  if (engine === state) engine = null;

  // Smooth fade-out to avoid a click, then disconnect.
  const now = state.ctx.currentTime;
  const master = state.master;
  try {
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0.0001, now + 0.12);
  } catch {
    /* ignore — ramp is best-effort */
  }
  window.setTimeout(() => {
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
    state.ctx.close().catch(() => {
      /* ignore */
    });
  }, 180);
}

/** Exposed solely for the scheduler unit test. @internal */
export const __test = {
  BASS_LINE,
  BPM,
  BEAT_SEC,
  BARS,
  BEATS_PER_BAR,
  LOOP_LEN_BEATS,
  SUBDIV_PER_BEAT,
  midiToHz,
};
