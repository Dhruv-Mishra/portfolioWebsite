/**
 * soundManager — sitewide hybrid sound engine.
 *
 * Each sound is specified with a procedural renderer AND optionally a URL
 * pointing to a small MP3 in /public/sounds/. On the first user gesture the
 * manager kicks off background fetches for URL-backed sounds; once decoded
 * they play back through `AudioBufferSourceNode`. Procedural renderers serve
 * as the guaranteed fallback — they run if the MP3 is still in-flight, if the
 * fetch fails (offline, 404), or if `decodeAudioData` isn't available
 * (SSR / tests).
 *
 * Design goals:
 *   - Near-zero network cost for users who never trigger a sound. URL-backed
 *     assets are only fetched after the first user gesture, and only if the
 *     user hasn't muted.
 *   - Single shared AudioContext, lazy-initialized on the first user gesture
 *     so that Chrome / Safari autoplay policies pass.
 *   - No runtime dependencies. Everything uses the browser-native Web Audio
 *     API (Oscillator, BufferSource, BiquadFilter, Gain).
 *   - Re-render-free for React. The mute state is exposed via the sticker
 *     store (useSyncExternalStore) so React consumers subscribe with a narrow
 *     selector; the manager itself runs outside React.
 *   - Tab-visibility aware. When the tab is hidden we suspend the context
 *     and skip playback entirely — no sound while the user isn't looking.
 *   - iOS Safari ringer switch: Web Audio respects the hardware mute on iOS,
 *     which is the desired behaviour. We never use <audio> elements.
 *
 * One-shot pre-emption:
 *   - Only one "one-shot" sound plays at a time. Every call to `play()` will
 *     fade-out-and-stop the previous one-shot over ~20ms before starting the
 *     new one. This keeps overlapping button-clicks + theme-switches + chat
 *     pings from piling up into a mush.
 *   - Composite procedural sounds (e.g. the superuser fanfare, which plays
 *     an arpeggio + chord + ping) are a SINGLE one-shot. Their voices all
 *     connect to a dedicated bundle gain, which the pre-emption engine treats
 *     as the atomic unit.
 *   - Loop sounds (`startLoop` / `stopLoop`) are NOT one-shots. They live on
 *     a separate channel and are unaffected by new play() calls — so a
 *     `disco-loop` keeps running through every `button-click`, `page-flip`,
 *     `theme-dark`, etc.
 *
 * The public API is minimal:
 *
 *   import { soundManager, type SoundId } from '@/lib/soundManager';
 *   soundManager.play('sticker-ding');
 *   soundManager.startLoop('disco-loop');
 *   soundManager.stopLoop('disco-loop');
 *
 * React consumers should go through `hooks/useSounds.ts`, which reads the
 * mute preference from the sticker store.
 *
 * Teardown: never needed under normal operation. The module lives for the
 * lifetime of the page; tear-down only matters in tests.
 */

export type SoundId =
  | 'page-flip'
  | 'chat-send'
  | 'chat-receive'
  | 'terminal-click'
  | 'sticker-ding'
  | 'superuser-fanfare'
  | 'theme-dark'
  | 'theme-light'
  | 'button-click'
  | 'feedback-sent'
  | 'guestbook-submit'
  | 'modal-open'
  | 'modal-close'
  | 'command-palette-pop'
  | 'disco-start'
  | 'disco-loop'
  | 'matrix';

/**
 * Critical-wave sounds — fetched in parallel on the first user gesture so the
 * very next playback has a decoded buffer ready. These are the cues a user will
 * hear during normal navigation (page flips, theme flips, clicks, modal
 * open/close, chat send/receive). Procedural fallbacks still exist, but the
 * goal is to not need them after the first tap.
 */
const CRITICAL_WAVE_IDS: ReadonlyArray<SoundId> = Object.freeze([
  'page-flip',
  'button-click',
  'theme-dark',
  'theme-light',
  'chat-send',
  'chat-receive',
  'modal-open',
  'modal-close',
]);

/**
 * Second-wave sounds — less frequent UI cues. Warmed up after the critical
 * wave lands or after a hard deadline (`SECOND_WAVE_DEADLINE_MS`), whichever
 * fires first. These have procedural fallbacks that are musically solid, so
 * even if the fetch lags there's no perceivable gap.
 */
const SECOND_WAVE_IDS: ReadonlyArray<SoundId> = Object.freeze([
  'sticker-ding',
  'feedback-sent',
  'guestbook-submit',
  'command-palette-pop',
  'terminal-click',
  'superuser-fanfare',
]);

/**
 * Superuser-gated sounds — only warmed up once the user has earned the hidden
 * superuser sticker. Pre-superuser visitors never download these bytes. The
 * warmup is triggered by the prefetch scheduler (`lib/assetPrefetch.ts`),
 * which calls `warmupSuperuserSounds` during an idle window.
 */
const SUPERUSER_WAVE_IDS: ReadonlyArray<SoundId> = Object.freeze([
  'disco-start',
  'disco-loop',
  'matrix',
]);

/** Deadline (ms) after which the second wave fires regardless of first-wave progress. */
const SECOND_WAVE_DEADLINE_MS = 500;

// ─── Environment helpers ────────────────────────────────────────────────

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

function createContext(): AudioContext | null {
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

// ─── Per-sound volume profile ───────────────────────────────────────────
/**
 * Master mix — relative volumes tuned so:
 *   - Celebratory sounds (fanfare, ding, feedback-sent) sit higher
 *   - Subtle UI ticks (click, terminal) are barely-there
 *   - Ambient cues (page-flip, modal) sit in the middle
 *
 * All values clamp to [0..1]. Keeping them below 0.3 leaves headroom for
 * the global mute ramp without clipping on cheap speakers.
 */
const VOLUMES: Readonly<Record<SoundId, number>> = Object.freeze({
  'page-flip':          0.08,
  'chat-send':          0.10,
  'chat-receive':       0.09,
  'terminal-click':     0.05,
  'sticker-ding':       0.15,
  'superuser-fanfare':  0.22,
  'theme-dark':         0.12,
  'theme-light':        0.18,
  'button-click':       0.04,
  'feedback-sent':      0.16,
  'guestbook-submit':   0.12,
  'modal-open':         0.06,
  'modal-close':        0.06,
  'command-palette-pop': 0.09,
  'disco-start':        0.22,
  'disco-loop':         0.18, // procedural fallback only — buffer uses sampleGain
  'matrix':             0.22, // looping matrix rain — loops via startLoop
});

// ─── Manager state ──────────────────────────────────────────────────────

interface ManagerState {
  ctx: AudioContext;
  master: GainNode;
  /** Cached reusable noise buffer (used by several percussive sounds). */
  noise: AudioBuffer;
}

let state: ManagerState | null = null;
let muted = false;

/** Track per-sound last-played timestamps for debouncing repeats. */
const lastPlayedAt: Partial<Record<SoundId, number>> = {};

/**
 * Per-sound debounce in ms. Prevents machine-gun-fire on rapid clicks, on
 * sticker unlock floods, and on theme toggle abuse.
 */
const DEBOUNCE_MS: Readonly<Record<SoundId, number>> = Object.freeze({
  'page-flip':          250,
  'chat-send':          80,
  'chat-receive':       80,
  'terminal-click':     40,
  'sticker-ding':       150,
  'superuser-fanfare':  500,
  'theme-dark':         250,
  'theme-light':        250,
  'button-click':       80,
  'feedback-sent':      400,
  'guestbook-submit':   400,
  'modal-open':         200,
  'modal-close':        200,
  'command-palette-pop': 150,
  'disco-start':        1500, // never double-fire on a single reveal
  'disco-loop':         0,    // N/A — loops go through startLoop()
  'matrix':             0,    // N/A — loops go through startLoop()
});

// ─── Noise buffer builder ───────────────────────────────────────────────

function buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const SECONDS = 1.0;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * SECONDS), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────

/**
 * Ensure the manager is initialized. Returns the state if available, else
 * null (SSR, blocked AudioContext, etc.). Safe to call on every play.
 * Autoplay policies: the first call typically lands during a user gesture,
 * which lets the context resume successfully. If we're not yet in a gesture
 * the context may stay 'suspended' and no sound plays — this is desired.
 */
function ensure(): ManagerState | null {
  if (state) return state;
  const ctx = createContext();
  if (!ctx) return null;
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  const newState: ManagerState = {
    ctx,
    master,
    noise: buildNoiseBuffer(ctx),
  };
  state = newState;
  // Background-warm the CRITICAL wave first (page-flip, theme-*, chat-*,
  // button-click, modal-*). These are the cues a user will hear during
  // normal navigation, so we want them decoded before the second tap. The
  // second wave (sticker-ding, feedback-sent, etc) is chained off the
  // critical wave settling, and the superuser wave (disco/matrix) is only
  // warmed externally by `lib/assetPrefetch.ts` after superuser is earned.
  warmupCriticalWave(ctx);
  // If the prefetch scheduler already requested a superuser warmup before
  // the gesture that created this context, honor it now.
  if (superuserWavePending) {
    superuserWavePending = false;
    warmupSuperuserWave(ctx);
  }
  return newState;
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ─── One-shot pre-emption bookkeeping ───────────────────────────────────

/**
 * An active one-shot "handle" — captures the bundle's output gain node plus
 * the earliest stop time we scheduled for it. Pre-emption calls `preempt()`
 * which ramps the gain to zero and schedules a hard stop on every child
 * source node a few ms later.
 *
 * For a simple `playTone` / `playNoiseBurst`, the bundle contains a single
 * source → filter? → gain. For composite sounds (fanfare, crow, feedback
 * chord), every voice routes through a SHARED bundle gain before reaching
 * master, so the one-shot engine only needs to touch a single gain node.
 */
interface OneShotHandle {
  /** Shared bundle gain — pre-emption ramps this. */
  gain: GainNode;
  /** Every source started for this bundle. Stopped hard on pre-emption. */
  sources: Array<AudioScheduledSourceNode>;
  /** Every node we should eventually disconnect on pre-emption. */
  nodes: Array<AudioNode>;
  /** Monotonic token — on src.onended callbacks this lets us tell whether
   *  we're still the active one-shot (races with pre-emption). */
  token: number;
  /** True once `preempt()` has been invoked; safeguards onended cleanup. */
  preempted: boolean;
}

let activeOneShot: OneShotHandle | null = null;
let oneShotTokenCounter = 0;

/** How fast pre-emption fades out the previous one-shot. */
const PREEMPT_FADE_SEC = 0.02;
/** Small grace after the fade before hard-stopping + disconnecting. */
const PREEMPT_STOP_LEAD_SEC = 0.005;

/**
 * Hard-stop + disconnect everything owned by an OneShotHandle. Safe to call
 * multiple times — every operation is idempotent or wrapped in try/catch.
 */
function teardownHandle(h: OneShotHandle): void {
  try {
    h.gain.disconnect();
  } catch {
    /* ignore */
  }
  for (const n of h.nodes) {
    try {
      n.disconnect();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Pre-empt the currently-playing one-shot: fade its output to silence over
 * ~20ms then schedule the underlying sources to stop. Clears the active
 * reference regardless of success — a failing node is still considered
 * "gone" from the manager's point of view.
 */
function preemptActive(s: ManagerState): void {
  const h = activeOneShot;
  if (!h) return;
  activeOneShot = null;
  h.preempted = true;
  const now = s.ctx.currentTime;
  try {
    h.gain.gain.cancelScheduledValues(now);
    h.gain.gain.setValueAtTime(h.gain.gain.value, now);
    h.gain.gain.linearRampToValueAtTime(0.0001, now + PREEMPT_FADE_SEC);
  } catch {
    /* some Web Audio impls throw on cancelScheduledValues in an odd state */
  }
  for (const src of h.sources) {
    try {
      src.stop(now + PREEMPT_FADE_SEC + PREEMPT_STOP_LEAD_SEC);
    } catch {
      /* already stopped, or scheduling past end — ignore */
    }
  }
  // Disconnect after the fade completes so the ramp has time to actually
  // fire. We use a setTimeout rather than scheduling on the audio clock
  // because disconnect() is a JS-side teardown.
  if (typeof window !== 'undefined') {
    window.setTimeout(() => {
      teardownHandle(h);
    }, (PREEMPT_FADE_SEC + PREEMPT_STOP_LEAD_SEC) * 1000 + 10);
  } else {
    teardownHandle(h);
  }
}

/**
 * Register a freshly-built one-shot as the currently-active handle.
 * Wires each source's `onended` to clear the activeOneShot pointer iff
 * we are still the owner — ensuring natural end-of-sound cleanup matches
 * the pre-emption code path.
 */
function installActiveOneShot(h: OneShotHandle): void {
  // Pre-empt should have been called by the caller already. Defensive: if
  // an old handle is still dangling, pre-empt it now.
  if (activeOneShot) {
    // Use the current manager state's ctx.
    const curr = state;
    if (curr) preemptActive(curr);
  }
  activeOneShot = h;
  for (const src of h.sources) {
    const prev = src.onended;
    src.onended = (evt): void => {
      try {
        if (typeof prev === 'function') prev.call(src, evt);
      } catch {
        /* ignore */
      }
      // Only clean up if we're still the owner AND haven't been pre-empted.
      if (activeOneShot && activeOneShot.token === h.token && !activeOneShot.preempted) {
        // Check: are all sources for this bundle done? Cheap heuristic:
        // we just mark this bundle as "ending" and tear down if all sources
        // are in a stopped state. Since we can't directly query a stopped
        // state on AudioScheduledSourceNode, we rely on the onended callback
        // firing last-in-bundle — the bundle's other sources have already
        // completed by that point, so tearing down here is safe.
        const allEnded = h.sources.every((s) => s === src || hasEnded(s));
        if (allEnded) {
          activeOneShot = null;
          teardownHandle(h);
        } else {
          // Mark this source as done so the sibling check above can resolve.
          markEnded(src);
        }
      }
    };
  }
}

/**
 * We can't ask a Web Audio source "are you done?" — so we track it with a
 * WeakSet.
 */
const endedSources: WeakSet<AudioScheduledSourceNode> = new WeakSet();

function markEnded(s: AudioScheduledSourceNode): void {
  endedSources.add(s);
}

function hasEnded(s: AudioScheduledSourceNode): boolean {
  return endedSources.has(s);
}

// ─── Bundle helper ──────────────────────────────────────────────────────

/**
 * Build a bundle gain for a one-shot and connect it to master. Renderers
 * that call into `playTone` / `playNoiseBurst` via the bundle's `dest`
 * will have all their voices automatically routed through this single gain
 * node, which the pre-emption engine treats as the atomic "one-shot".
 */
function openBundle(s: ManagerState): OneShotHandle {
  const bundleGain = s.ctx.createGain();
  bundleGain.gain.value = 1;
  bundleGain.connect(s.master);
  return {
    gain: bundleGain,
    sources: [],
    nodes: [bundleGain],
    token: ++oneShotTokenCounter,
    preempted: false,
  };
}

// ─── Synthesis helpers ──────────────────────────────────────────────────

/**
 * Play a filtered-noise burst with an envelope. Used by percussive / breath
 * sounds (page flip, pen scratch, modal whoosh).
 *
 * Side effect: pushes the source + filter + gain into `bundle` so the
 * pre-emption engine can find them.
 */
function playNoiseBurst(
  s: ManagerState,
  bundle: OneShotHandle,
  startTime: number,
  options: {
    duration: number;
    filterType: BiquadFilterType;
    filterFreqStart: number;
    filterFreqEnd: number;
    filterQ: number;
    peakGain: number;
    attackSec?: number;
  },
): void {
  const { ctx, noise } = s;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = noise;
  // Loop to cover durations > noise buffer length (1s), unlikely but safe.
  src.loop = options.duration > 0.9;

  filter.type = options.filterType;
  filter.frequency.setValueAtTime(options.filterFreqStart, startTime);
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(options.filterFreqEnd, 30),
    startTime + options.duration,
  );
  filter.Q.value = options.filterQ;

  const attack = options.attackSec ?? 0.01;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(options.peakGain, startTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + options.duration);

  src.connect(filter).connect(gain).connect(bundle.gain);
  src.start(startTime);
  src.stop(startTime + options.duration + 0.05);

  bundle.sources.push(src);
  bundle.nodes.push(src, filter, gain);
}

/**
 * Play an oscillator tone with an AR envelope. Used for melodic / tonal
 * sounds (chat ping, fanfare notes, bell, click ticks).
 */
function playTone(
  s: ManagerState,
  bundle: OneShotHandle,
  startTime: number,
  options: {
    freqStart: number;
    freqEnd?: number;
    type?: OscillatorType;
    duration: number;
    attackSec?: number;
    peakGain: number;
    detune?: number;
  },
): void {
  const { ctx } = s;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = options.type ?? 'sine';
  osc.frequency.setValueAtTime(options.freqStart, startTime);
  if (options.freqEnd !== undefined && options.freqEnd !== options.freqStart) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(options.freqEnd, 1),
      startTime + options.duration,
    );
  }
  if (options.detune) osc.detune.value = options.detune;

  const attack = options.attackSec ?? 0.005;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(options.peakGain, startTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + options.duration);

  osc.connect(gain).connect(bundle.gain);
  osc.start(startTime);
  osc.stop(startTime + options.duration + 0.05);

  bundle.sources.push(osc);
  bundle.nodes.push(osc, gain);
}

// ─── Sound-specific renderers ───────────────────────────────────────────

function playPageFlip(s: ManagerState, bundle: OneShotHandle, t: number, volume: number): void {
  // Filtered noise sweep from ~2.5kHz down to ~400Hz over 180ms — the
  // "pfffph" of a page turning.
  playNoiseBurst(s, bundle, t, {
    duration: 0.18,
    filterType: 'bandpass',
    filterFreqStart: 2600,
    filterFreqEnd: 600,
    filterQ: 1.2,
    peakGain: volume,
    attackSec: 0.008,
  });
}

function playChatSend(s: ManagerState, bundle: OneShotHandle, t: number, volume: number): void {
  // Two ascending sine notes — "fwip-fwip" send cue.
  playTone(s, bundle, t, {
    freqStart: midiToHz(76), // E5
    type: 'sine',
    duration: 0.08,
    peakGain: volume,
  });
  playTone(s, bundle, t + 0.06, {
    freqStart: midiToHz(83), // B5
    type: 'sine',
    duration: 0.12,
    peakGain: volume,
  });
}

function playChatReceive(s: ManagerState, bundle: OneShotHandle, t: number, volume: number): void {
  // Descending two-note — gentle receive.
  playTone(s, bundle, t, {
    freqStart: midiToHz(81), // A5
    type: 'sine',
    duration: 0.08,
    peakGain: volume,
  });
  playTone(s, bundle, t + 0.06, {
    freqStart: midiToHz(74), // D5
    type: 'sine',
    duration: 0.16,
    peakGain: volume,
  });
}

function playTerminalClick(s: ManagerState, bundle: OneShotHandle, t: number, volume: number): void {
  // Very short BPF noise click — typewriter mechanical tick.
  playNoiseBurst(s, bundle, t, {
    duration: 0.028,
    filterType: 'bandpass',
    filterFreqStart: 3200,
    filterFreqEnd: 2800,
    filterQ: 6,
    peakGain: volume,
    attackSec: 0.003,
  });
}

function playStickerDing(s: ManagerState, bundle: OneShotHandle, t: number, volume: number): void {
  // Bell-like: fundamental + fifth + third, triangle wave, long decay.
  playTone(s, bundle, t, {
    freqStart: midiToHz(88), // E6
    type: 'triangle',
    duration: 0.6,
    peakGain: volume,
  });
  playTone(s, bundle, t + 0.002, {
    freqStart: midiToHz(95), // B6 (fifth above)
    type: 'sine',
    duration: 0.5,
    peakGain: volume * 0.55,
  });
  playTone(s, bundle, t + 0.004, {
    freqStart: midiToHz(92), // G#6 (major third)
    type: 'sine',
    duration: 0.45,
    peakGain: volume * 0.35,
  });
}

function playSuperuserFanfare(s: ManagerState, bundle: OneShotHandle, t: number, volume: number): void {
  // Ascending G major arpeggio + triumphant triad at the top.
  // G4 B4 D5 G5  → then G5/B5/D6 sustained triad.
  const arp: ReadonlyArray<number> = [67, 71, 74, 79];
  const stride = 0.08;
  arp.forEach((midi, i) => {
    playTone(s, bundle, t + i * stride, {
      freqStart: midiToHz(midi),
      type: 'triangle',
      duration: 0.14,
      peakGain: volume * 0.75,
    });
  });
  // Sustained triad flourish.
  const chordStart = t + arp.length * stride + 0.02;
  const chord: ReadonlyArray<number> = [79, 83, 86]; // G5 B5 D6
  chord.forEach((midi, i) => {
    playTone(s, bundle, chordStart, {
      freqStart: midiToHz(midi),
      type: 'triangle',
      duration: 0.9,
      peakGain: volume * 0.55,
      detune: (i - 1) * 3, // subtle detune for chord warmth
    });
  });
  // A sparkly high ping on top at the very end for glitter.
  playTone(s, bundle, chordStart + 0.12, {
    freqStart: midiToHz(91), // G6
    type: 'sine',
    duration: 0.5,
    peakGain: volume * 0.4,
  });
}

function playThemeDark(s: ManagerState, bundle: OneShotHandle, t: number, volume: number): void {
  // Cricket cluster — three narrow BPF noise bursts at ~4.5kHz, spaced.
  const chirps = 4;
  for (let i = 0; i < chirps; i++) {
    const delay = i * 0.08 + Math.random() * 0.02;
    // Each chirp is a rapid sequence of 3-4 micro-pulses (wing rub).
    for (let j = 0; j < 3; j++) {
      playNoiseBurst(s, bundle, t + delay + j * 0.012, {
        duration: 0.006,
        filterType: 'bandpass',
        filterFreqStart: 4400 + Math.random() * 400,
        filterFreqEnd: 4300,
        filterQ: 20,
        peakGain: volume,
        attackSec: 0.001,
      });
    }
  }
}

function playThemeLight(s: ManagerState, bundle: OneShotHandle, t: number, volume: number): void {
  // Rooster-ish crow — pitched sawtooth with formant-style filter sweep + noise tail.
  // Four syllables: "er-er-ER-Errrr"
  const { ctx } = s;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(midiToHz(69), t);              // A4
  osc.frequency.exponentialRampToValueAtTime(midiToHz(72), t + 0.15); // C5
  osc.frequency.exponentialRampToValueAtTime(midiToHz(77), t + 0.45); // F5
  osc.frequency.exponentialRampToValueAtTime(midiToHz(65), t + 0.9);  // F4 (drop)

  filter.type = 'bandpass';
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(900, t);
  filter.frequency.exponentialRampToValueAtTime(1400, t + 0.3);
  filter.frequency.exponentialRampToValueAtTime(800, t + 0.9);

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.03);
  gain.gain.setValueAtTime(volume, t + 0.15);
  gain.gain.exponentialRampToValueAtTime(volume * 0.8, t + 0.3);
  gain.gain.setValueAtTime(volume * 0.9, t + 0.45);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);

  osc.connect(filter).connect(gain).connect(bundle.gain);
  osc.start(t);
  osc.stop(t + 1.0);

  bundle.sources.push(osc);
  bundle.nodes.push(osc, filter, gain);

  // Noise grit tail — breathy crow cadence.
  playNoiseBurst(s, bundle, t + 0.02, {
    duration: 0.75,
    filterType: 'bandpass',
    filterFreqStart: 2000,
    filterFreqEnd: 900,
    filterQ: 1.5,
    peakGain: volume * 0.4,
    attackSec: 0.04,
  });
}

function playButtonClick(s: ManagerState, bundle: OneShotHandle, t: number, volume: number): void {
  // Tiny high sine blip.
  playTone(s, bundle, t, {
    freqStart: midiToHz(96), // C7
    type: 'sine',
    duration: 0.03,
    peakGain: volume,
  });
}

function playFeedbackSent(s: ManagerState, bundle: OneShotHandle, t: number, volume: number): void {
  // Three-note major arpeggio — C5 E5 G5 — pleasant chime.
  const notes: ReadonlyArray<number> = [72, 76, 79];
  notes.forEach((midi, i) => {
    playTone(s, bundle, t + i * 0.06, {
      freqStart: midiToHz(midi),
      type: 'sine',
      duration: 0.25,
      peakGain: volume,
    });
    // Subtle triangle beneath each note for warmth.
    playTone(s, bundle, t + i * 0.06, {
      freqStart: midiToHz(midi + 12),
      type: 'triangle',
      duration: 0.2,
      peakGain: volume * 0.3,
    });
  });
}

function playGuestbookSubmit(s: ManagerState, bundle: OneShotHandle, t: number, volume: number): void {
  // Pen scratch — two quick filtered noise sweeps.
  playNoiseBurst(s, bundle, t, {
    duration: 0.12,
    filterType: 'bandpass',
    filterFreqStart: 1200,
    filterFreqEnd: 2200,
    filterQ: 1.8,
    peakGain: volume,
    attackSec: 0.01,
  });
  playNoiseBurst(s, bundle, t + 0.1, {
    duration: 0.1,
    filterType: 'bandpass',
    filterFreqStart: 1800,
    filterFreqEnd: 800,
    filterQ: 1.8,
    peakGain: volume * 0.7,
    attackSec: 0.01,
  });
}

function playModalOpen(s: ManagerState, bundle: OneShotHandle, t: number, volume: number): void {
  // Rising whoosh — paper lifted.
  playNoiseBurst(s, bundle, t, {
    duration: 0.22,
    filterType: 'bandpass',
    filterFreqStart: 300,
    filterFreqEnd: 1600,
    filterQ: 0.9,
    peakGain: volume,
    attackSec: 0.05,
  });
}

function playModalClose(s: ManagerState, bundle: OneShotHandle, t: number, volume: number): void {
  // Falling whoosh — paper settling.
  playNoiseBurst(s, bundle, t, {
    duration: 0.18,
    filterType: 'bandpass',
    filterFreqStart: 1500,
    filterFreqEnd: 300,
    filterQ: 0.9,
    peakGain: volume,
    attackSec: 0.02,
  });
}

function playCommandPalettePop(s: ManagerState, bundle: OneShotHandle, t: number, volume: number): void {
  // Short upward sine chirp — pop.
  playTone(s, bundle, t, {
    freqStart: midiToHz(72),
    freqEnd: midiToHz(84),
    type: 'sine',
    duration: 0.1,
    peakGain: volume,
    attackSec: 0.005,
  });
}

/**
 * Disco-start procedural fallback — a victory riff: ascending pentatonic
 * sweep + a sustained power chord. Only fires when the URL sample isn't
 * available yet. Reuses the fanfare's musical architecture (arpeggio +
 * triad) but brighter, with a chunkier chord.
 */
function playDiscoStart(s: ManagerState, bundle: OneShotHandle, t: number, volume: number): void {
  // Ascending pentatonic flourish.
  const arp: ReadonlyArray<number> = [69, 72, 76, 79, 83]; // A4 C5 E5 G5 B5
  const stride = 0.055;
  arp.forEach((midi, i) => {
    playTone(s, bundle, t + i * stride, {
      freqStart: midiToHz(midi),
      type: 'sawtooth',
      duration: 0.12,
      peakGain: volume * 0.6,
    });
  });
  // Power chord stab to finish — root + fifth + octave, sustained 1.2s.
  const chordStart = t + arp.length * stride + 0.02;
  const chord: ReadonlyArray<number> = [69, 76, 81]; // A4 E5 A5
  chord.forEach((midi, i) => {
    playTone(s, bundle, chordStart, {
      freqStart: midiToHz(midi),
      type: 'sawtooth',
      duration: 1.2,
      peakGain: volume * 0.4,
      detune: (i - 1) * 4,
    });
  });
}

/**
 * Disco-loop procedural fallback — a short bass-heavy stab that's NOT
 * actually a loop; it's a single call used during the brief buffer-fetch
 * window. The real looping is handled by a dedicated path in `startLoop`
 * that falls back to the existing discoAudio.ts engine.
 *
 * This renderer is wired into `SOUND_SPECS` purely so that debounce + renderer
 * invariants stay consistent — nothing should ever call `play('disco-loop')`
 * directly. startLoop handles the looping correctly.
 */
function playDiscoLoopFallback(s: ManagerState, bundle: OneShotHandle, t: number, volume: number): void {
  // A single short stab as a placeholder.
  playTone(s, bundle, t, {
    freqStart: midiToHz(45),
    type: 'sawtooth',
    duration: 0.2,
    peakGain: volume,
  });
}

/**
 * Matrix procedural fallback — a low, ominous sub-drone. Only fires if the
 * matrix.mp3 buffer hasn't been decoded yet AND the matrix effect is already
 * active (rare — matrix is superuser-gated, so the prefetch scheduler almost
 * always lands the buffer before activation). Kept tonally quiet so it blends
 * until the real sample takes over on hot-swap.
 */
function playMatrixFallback(s: ManagerState, bundle: OneShotHandle, t: number, volume: number): void {
  playTone(s, bundle, t, {
    freqStart: midiToHz(36), // C2 — very low drone
    type: 'sawtooth',
    duration: 0.8,
    peakGain: volume * 0.4,
  });
}

// ─── Dispatcher ─────────────────────────────────────────────────────────

type Renderer = (s: ManagerState, bundle: OneShotHandle, t: number, volume: number) => void;

/**
 * Per-sound spec — procedural renderer (always present) plus optional URL for
 * a recorded sample. When a URL is specified the manager prefetches + decodes
 * on first gesture; once cached, playback uses the sample via
 * `AudioBufferSourceNode`. The renderer stays as fallback for the brief
 * window before the sample lands (and for offline / test environments).
 */
interface SoundSpec {
  render: Renderer;
  /** Static asset URL under /public/sounds/. Absent → procedural only. */
  url?: string;
  /** Playback gain applied to buffer-backed sample (0..1). Default 0.7. */
  sampleGain?: number;
}

const SOUND_SPECS: Readonly<Record<SoundId, SoundSpec>> = Object.freeze({
  // URL-backed: user-supplied MP3s cropped to 2.5s @ 96 kbps mono.
  'page-flip':          { render: playPageFlip,   url: '/sounds/page-flip.mp3',   sampleGain: 0.55 },
  'theme-dark':         { render: playThemeDark,  url: '/sounds/theme-dark.mp3',  sampleGain: 0.65 },
  'theme-light':        { render: playThemeLight, url: '/sounds/theme-light.mp3', sampleGain: 0.7 },
  'disco-start':        { render: playDiscoStart, url: '/sounds/disco-start.mp3', sampleGain: 0.75 },
  'disco-loop':         { render: playDiscoLoopFallback, url: '/sounds/disco-loop.mp3', sampleGain: 0.35 },
  'matrix':             { render: playMatrixFallback, url: '/sounds/matrix.mp3', sampleGain: 0.5 },

  // Procedural-only.
  'chat-send':          { render: playChatSend },
  'chat-receive':       { render: playChatReceive },
  'terminal-click':     { render: playTerminalClick },
  'sticker-ding':       { render: playStickerDing },
  'superuser-fanfare':  { render: playSuperuserFanfare },
  'button-click':       { render: playButtonClick },
  'feedback-sent':      { render: playFeedbackSent },
  'guestbook-submit':   { render: playGuestbookSubmit },
  'modal-open':         { render: playModalOpen },
  'modal-close':        { render: playModalClose },
  'command-palette-pop': { render: playCommandPalettePop },
});

// ─── Buffer cache for URL-backed sounds ─────────────────────────────────
/** Decoded sample cache. Populated async once the context exists and the fetch
 *  lands. Playback reads from here; if empty we fall through to the renderer. */
const bufferCache: Map<SoundId, AudioBuffer> = new Map();
/** Per-sound "already attempted" latch to avoid retrying a failed fetch on
 *  every play call (that would be a network-storm anti-pattern). */
const warmupAttempted: Set<SoundId> = new Set();
/** Per-sound "in flight" latch — deduplicates concurrent warmup calls so a
 *  critical-wave trigger and a superuser-wave trigger for the same sound
 *  don't race the fetch. Used by `warmupSound` and the wave schedulers. */
const warmupInflight: Set<SoundId> = new Set();
/** Subscribers waiting for a specific buffer to land. Used by `startLoop`'s
 *  switchover logic so the disco engine can upgrade from procedural to
 *  buffer-backed the moment the decode finishes. */
const bufferReadySubscribers: Map<SoundId, Array<() => void>> = new Map();
/** Has the second wave been kicked off? Guard against double-schedule. */
let secondWaveScheduled = false;
/** Has the superuser wave been kicked off? Guard against re-warm. */
let superuserWaveScheduled = false;
/**
 * Latched request to run the superuser wave the next time an AudioContext
 * becomes available. Set by `warmupSuperuserSounds()` if called before the
 * first user gesture; drained by `ensure()`.
 */
let superuserWavePending = false;

function notifyBufferReady(id: SoundId): void {
  const subs = bufferReadySubscribers.get(id);
  if (!subs) return;
  bufferReadySubscribers.delete(id);
  for (const fn of subs) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function decodeArrayBuffer(ctx: AudioContext, bytes: ArrayBuffer): Promise<AudioBuffer | null> {
  // decodeAudioData returns a Promise in modern browsers; some older Safari
  // versions expect callbacks. The callback form still resolves the promise
  // result in those environments, so this single-branch call is safe.
  if (typeof ctx.decodeAudioData !== 'function') return Promise.resolve(null);
  try {
    return ctx.decodeAudioData(bytes).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

async function warmupSound(ctx: AudioContext, id: SoundId, url: string): Promise<void> {
  // Dedupe: skip if already cached, already attempted, or a concurrent call
  // is already in flight for this id.
  if (bufferCache.has(id) || warmupAttempted.has(id) || warmupInflight.has(id)) return;
  warmupInflight.add(id);
  warmupAttempted.add(id);
  if (typeof fetch !== 'function') {
    warmupInflight.delete(id);
    return;
  }
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return;
    const bytes = await res.arrayBuffer();
    const decoded = await decodeArrayBuffer(ctx, bytes);
    if (decoded) {
      bufferCache.set(id, decoded);
      notifyBufferReady(id);
    }
  } catch {
    /* best-effort; procedural fallback will cover this sound */
  } finally {
    warmupInflight.delete(id);
  }
}

/**
 * Schedule a callback during the next idle window. Falls back to a short
 * `setTimeout` on browsers without `requestIdleCallback` (Safari, older
 * mobile). The deadline guarantees the wave always fires, even if the main
 * thread is permanently busy.
 */
function scheduleIdle(cb: () => void, fallbackMs: number): void {
  if (typeof window === 'undefined') return;
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(cb, { timeout: fallbackMs });
  } else {
    window.setTimeout(cb, Math.min(fallbackMs, 200));
  }
}

/**
 * Warm up the critical wave — the URL-backed cues a user hits during normal
 * navigation. Kicked off on first gesture by `ensure()`. Fires the second
 * wave once all critical fetches settle, or at the deadline, whichever first.
 */
function warmupCriticalWave(ctx: AudioContext): void {
  const pending: Array<Promise<void>> = [];
  for (const id of CRITICAL_WAVE_IDS) {
    const spec = SOUND_SPECS[id];
    if (!spec.url) continue;
    pending.push(warmupSound(ctx, id, spec.url));
  }
  // Second wave fires as soon as critical wave settles (all promises resolve),
  // OR at the deadline — whichever arrives first. Race ensures we don't stall
  // indefinitely on a slow connection.
  let secondFired = false;
  const fireSecond = (): void => {
    if (secondFired) return;
    secondFired = true;
    scheduleSecondWave(ctx);
  };
  void Promise.allSettled(pending).then(fireSecond);
  if (typeof window !== 'undefined') {
    window.setTimeout(fireSecond, SECOND_WAVE_DEADLINE_MS);
  }
}

/**
 * Warm up the second wave — less-frequent UI cues. Only runs once per
 * session. Idle-scheduled so it yields to any critical rendering happening
 * immediately after the first gesture.
 */
function scheduleSecondWave(ctx: AudioContext): void {
  if (secondWaveScheduled) return;
  secondWaveScheduled = true;
  scheduleIdle(() => {
    for (const id of SECOND_WAVE_IDS) {
      const spec = SOUND_SPECS[id];
      if (!spec.url) continue;
      void warmupSound(ctx, id, spec.url);
    }
  }, 800);
}

/**
 * Warm up the superuser-gated wave — disco + matrix. ONLY invoked externally
 * by `lib/assetPrefetch.ts` after `hasSuperuser` flips true, so pre-superuser
 * visitors never pay for these bytes. Idempotent + deduped.
 *
 * @internal — exposed on the manager as `warmupSuperuserSounds` for the
 * prefetch scheduler. Calling this without an active `AudioContext` is a
 * no-op; the scheduler waits for the first user gesture to run it.
 */
function warmupSuperuserWave(ctx: AudioContext): void {
  if (superuserWaveScheduled) return;
  superuserWaveScheduled = true;
  scheduleIdle(() => {
    for (const id of SUPERUSER_WAVE_IDS) {
      const spec = SOUND_SPECS[id];
      if (!spec.url) continue;
      void warmupSound(ctx, id, spec.url);
    }
  }, 1500);
}

function playBufferedSample(
  s: ManagerState,
  startTime: number,
  buffer: AudioBuffer,
  volume: number,
): OneShotHandle {
  const { ctx } = s;
  const bundle = openBundle(s);
  const src = ctx.createBufferSource();
  const bodyGain = ctx.createGain();
  src.buffer = buffer;
  bodyGain.gain.value = volume;
  src.connect(bodyGain).connect(bundle.gain);
  src.start(startTime);
  bundle.sources.push(src);
  bundle.nodes.push(src, bodyGain);
  return bundle;
}

// ─── Loop channel ───────────────────────────────────────────────────────

/**
 * Per-loop bookkeeping. Loops are never pre-empted by one-shots; they live
 * on their own gain chain attached to master. startLoop() is idempotent —
 * calling twice for the same id does nothing.
 *
 * `mode: 'buffer'` means the loop is backed by the decoded MP3.
 * `mode: 'procedural-external'` means we're using the discoAudio engine as
 *   an external procedural fallback; the handle is stored in `external` and
 *   the gain node is unused.
 */
interface LoopHandle {
  id: SoundId;
  mode: 'buffer' | 'procedural-external';
  /** For buffer-backed loops. */
  src?: AudioBufferSourceNode;
  gain?: GainNode;
  /** For procedural-external loops (disco) — opaque handle we stop()/setMuted() on. */
  external?: {
    stop: () => void;
    setMuted: (m: boolean) => void;
  };
  /** Set once we've begun the fade-out ramp in stopLoop(); guards against
   *  double-stops. */
  stopping: boolean;
}

const loopRegistry: Map<SoundId, LoopHandle> = new Map();

const LOOP_FADE_IN_SEC = 0.08;
const LOOP_FADE_OUT_SEC = 0.3;

function startBufferLoop(s: ManagerState, id: SoundId, buffer: AudioBuffer, volume: number): LoopHandle {
  const { ctx } = s;
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buffer;
  src.loop = true;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + LOOP_FADE_IN_SEC);
  src.connect(gain).connect(s.master);
  src.start(ctx.currentTime);
  return { id, mode: 'buffer', src, gain, stopping: false };
}

function stopLoopHandle(s: ManagerState | null, h: LoopHandle): void {
  if (h.stopping) return;
  h.stopping = true;
  if (h.mode === 'buffer') {
    if (!s || !h.gain || !h.src) return;
    const now = s.ctx.currentTime;
    try {
      h.gain.gain.cancelScheduledValues(now);
      h.gain.gain.setValueAtTime(h.gain.gain.value, now);
      h.gain.gain.linearRampToValueAtTime(0.0001, now + LOOP_FADE_OUT_SEC);
    } catch {
      /* ignore */
    }
    try {
      h.src.stop(now + LOOP_FADE_OUT_SEC + 0.02);
    } catch {
      /* ignore */
    }
    // Delayed disconnect so the fade has time to actually reach zero.
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        try {
          h.src?.disconnect();
          h.gain?.disconnect();
        } catch {
          /* ignore */
        }
      }, LOOP_FADE_OUT_SEC * 1000 + 50);
    }
  } else {
    try {
      h.external?.stop();
    } catch {
      /* ignore */
    }
  }
}

// ─── Public surface ─────────────────────────────────────────────────────

export interface SoundManagerDiagnostics {
  /** Ids of every sound whose buffer is decoded and playback-ready. */
  readonly buffered: ReadonlyArray<SoundId>;
  /** Ids of every sound where a warmup fetch is currently in flight. */
  readonly inflight: ReadonlyArray<SoundId>;
  /** Ids where the warmup has been attempted (success or failure). */
  readonly attempted: ReadonlyArray<SoundId>;
  /** Has the critical wave kicked off? (proxy: is there a manager state?) */
  readonly criticalWaveStarted: boolean;
  /** Has the second wave been scheduled? */
  readonly secondWaveScheduled: boolean;
  /** Has the superuser wave been scheduled? */
  readonly superuserWaveScheduled: boolean;
}

export interface SoundManager {
  /**
   * Play a sound by id. Returns `true` if dispatched, `false` if skipped
   * (muted / debounced / no AudioContext / tab hidden / SSR).
   *
   * Any currently-playing one-shot sound is pre-empted — faded out and
   * stopped — before the new one starts. Looping sounds (see `startLoop`)
   * are unaffected.
   */
  play(id: SoundId): boolean;
  /**
   * Start a looping sound. Idempotent — calling twice is a no-op.
   * Returns true if the loop was started (or was already running), false
   * if we couldn't start it (no AudioContext, mute was ignored).
   *
   * If the URL sample is decoded, uses the buffer. Otherwise attempts
   * a procedural fallback (only supported for `disco-loop`; any other id
   * without a decoded buffer returns false).
   */
  startLoop(id: SoundId): boolean;
  /** Stop a looping sound with a short fade-out. Idempotent. */
  stopLoop(id: SoundId): void;
  /** Is a loop currently playing? */
  isLoopPlaying(id: SoundId): boolean;
  /**
   * Per-loop mute. Independent of the global `setMuted` — the loop's gain
   * node (buffer mode) or external setMuted (procedural mode) is toggled.
   *
   * Internal plumbing primitive: in v5 the sitewide `soundsMuted` preference
   * is the single source of truth for muting every sound, including loops.
   * The DiscoAudioBridge still calls this directly to push the current
   * preference into a freshly-started loop (so a loop that starts up while
   * the user is muted does not briefly leak audio). UI code should NOT
   * call this directly — go through `setMuted` + `setSoundsMutedImperative`.
   *
   * No-op if the loop isn't playing.
   */
  setLoopMuted(id: SoundId, muted: boolean): void;
  /** True iff the URL buffer for this sound has been fetched + decoded. */
  hasBuffer(id: SoundId): boolean;
  /** Set the global mute state. Pending sounds are silenced immediately. */
  setMuted(next: boolean): void;
  /** True if currently muted. */
  isMuted(): boolean;
  /** Is the AudioContext present and running? Diagnostic only. */
  isReady(): boolean;
  /** Tear everything down. Test-only. */
  __reset(): void;
  /**
   * Subscribe to a buffer-ready event for a specific sound id. The callback
   * fires once the MP3 decode completes (or immediately if already cached).
   * Returns an unsubscribe function. Used by `DiscoAudioBridge` to upgrade
   * from procedural fallback → buffer playback on the first successful decode.
   */
  onBufferReady(id: SoundId, cb: () => void): () => void;
  /**
   * Schedule warmup of the superuser-gated sound wave (disco + matrix).
   * Called by `lib/assetPrefetch.ts` after the user has earned superuser.
   * If no AudioContext exists yet (no gesture has fired), records the
   * intent so that the next `ensure()` picks it up after kicking off the
   * critical wave.
   */
  warmupSuperuserSounds(): void;
  /**
   * Pre-warm the AudioContext imperatively on a user gesture. Idempotent —
   * subsequent calls are a no-op. Use this from gesture handlers (e.g. a
   * layout-level click handler) to eagerly decode critical sounds on the
   * very first tap, ahead of any `play()` call.
   */
  primeOnGesture(): void;
  /**
   * Diagnostic accessor. Exposes the warmup state for tests + debugging.
   * Do not read from this in render paths.
   */
  readonly __debug: SoundManagerDiagnostics;
}

/**
 * Compute the effective mute state — the store preference OR tab hidden.
 * Exposed so the hook can short-circuit without touching the manager.
 */
function isTabHidden(): boolean {
  if (typeof document === 'undefined') return false;
  return document.visibilityState === 'hidden';
}

/**
 * Optional external-loop procedural factory. The disco engine registers a
 * factory here so that `startLoop('disco-loop')` can fall back to
 * procedural-external mode when the buffer isn't available yet. We keep this
 * as a registration hook rather than a hard import to preserve the bundle
 * split — the disco engine only reaches this module once disco activates.
 */
type ExternalLoopFactory = () => { stop: () => void; setMuted: (m: boolean) => void } | null;
const externalLoopFactories: Map<SoundId, ExternalLoopFactory> = new Map();

/**
 * Register a procedural-external loop factory for a sound id. Called by the
 * disco engine on its first module import. The factory is invoked when
 * `startLoop(id)` is called and no buffer is available.
 *
 * @internal — only `DiscoAudioBridge` should call this.
 */
export function registerExternalLoopFactory(id: SoundId, factory: ExternalLoopFactory): void {
  externalLoopFactories.set(id, factory);
}

export const soundManager: SoundManager = {
  play(id: SoundId): boolean {
    if (muted) return false;
    if (typeof window === 'undefined') return false;
    if (isTabHidden()) return false;

    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const last = lastPlayedAt[id] ?? 0;
    const debounce = DEBOUNCE_MS[id] ?? 80;
    if (now - last < debounce) return false;

    const s = ensure();
    if (!s) return false;
    // If the context was created suspended (pre-gesture), try to resume.
    if (s.ctx.state === 'suspended') {
      s.ctx.resume().catch(() => {
        /* best-effort — if it fails we'll just play silence this round */
      });
    }
    // Guard: if still not running (no user gesture yet), bail. The next
    // gesture-triggered play will work.
    if (s.ctx.state !== 'running') return false;

    const t = s.ctx.currentTime;
    const spec = SOUND_SPECS[id];
    const cached = bufferCache.get(id);
    try {
      // Pre-empt the currently-playing one-shot (if any) before we start a
      // new one. Loops are NOT touched.
      preemptActive(s);

      let bundle: OneShotHandle;
      if (cached) {
        // Prefer the pre-decoded sample. `sampleGain` is independent of the
        // procedural `VOLUMES` table because samples come in at arbitrary
        // levels.
        bundle = playBufferedSample(s, t, cached, spec.sampleGain ?? 0.7);
      } else {
        // Procedural fallback — either no URL configured, still fetching, or
        // the fetch / decode failed. Perceptually identical to the pre-hybrid
        // behaviour.
        bundle = openBundle(s);
        spec.render(s, bundle, t, VOLUMES[id] ?? 0.1);
      }
      installActiveOneShot(bundle);
    } catch {
      // Never let a synthesis error bubble up into the UI.
      return false;
    }
    lastPlayedAt[id] = now;
    return true;
  },

  startLoop(id: SoundId): boolean {
    if (typeof window === 'undefined') return false;
    // Idempotent.
    if (loopRegistry.has(id)) return true;
    const s = ensure();
    if (!s) return false;
    if (s.ctx.state === 'suspended') {
      s.ctx.resume().catch(() => {
        /* best-effort */
      });
    }
    if (s.ctx.state !== 'running') {
      // Context not yet unlocked (no user gesture). Cannot start a loop —
      // the caller (disco bridge) must retry on a later gesture.
      return false;
    }
    const spec = SOUND_SPECS[id];
    if (!spec) return false;
    const buffer = bufferCache.get(id);
    if (buffer) {
      const handle = startBufferLoop(s, id, buffer, spec.sampleGain ?? 0.35);
      loopRegistry.set(id, handle);
      return true;
    }
    // No buffer yet — try the procedural-external factory.
    const factory = externalLoopFactories.get(id);
    if (factory) {
      const ext = factory();
      if (ext) {
        const handle: LoopHandle = {
          id,
          mode: 'procedural-external',
          external: ext,
          stopping: false,
        };
        loopRegistry.set(id, handle);
        return true;
      }
    }
    return false;
  },

  stopLoop(id: SoundId): void {
    const h = loopRegistry.get(id);
    if (!h) return;
    loopRegistry.delete(id);
    stopLoopHandle(state, h);
  },

  isLoopPlaying(id: SoundId): boolean {
    const h = loopRegistry.get(id);
    return !!h && !h.stopping;
  },

  setLoopMuted(id: SoundId, muted: boolean): void {
    const h = loopRegistry.get(id);
    if (!h || h.stopping) return;
    const spec = SOUND_SPECS[id];
    const targetVolume = muted ? 0 : (spec?.sampleGain ?? 0.35);
    if (h.mode === 'buffer') {
      if (!h.gain || !state) return;
      const now = state.ctx.currentTime;
      try {
        h.gain.gain.cancelScheduledValues(now);
        h.gain.gain.setValueAtTime(h.gain.gain.value, now);
        h.gain.gain.linearRampToValueAtTime(targetVolume, now + 0.12);
      } catch {
        /* ignore */
      }
    } else if (h.external) {
      try {
        h.external.setMuted(muted);
      } catch {
        /* ignore */
      }
    }
  },

  hasBuffer(id: SoundId): boolean {
    return bufferCache.has(id);
  },

  onBufferReady(id: SoundId, cb: () => void): () => void {
    if (bufferCache.has(id)) {
      // Already cached — fire on next tick so callers don't need to worry
      // about re-entrant state changes inside their own mount effect.
      if (typeof window !== 'undefined') {
        window.setTimeout(cb, 0);
      } else {
        cb();
      }
      return () => { /* noop */ };
    }
    let subs = bufferReadySubscribers.get(id);
    if (!subs) {
      subs = [];
      bufferReadySubscribers.set(id, subs);
    }
    subs.push(cb);
    return (): void => {
      const list = bufferReadySubscribers.get(id);
      if (!list) return;
      const idx = list.indexOf(cb);
      if (idx >= 0) list.splice(idx, 1);
      if (list.length === 0) bufferReadySubscribers.delete(id);
    };
  },

  setMuted(next: boolean): void {
    muted = next;
    if (!state) return;
    // Smooth mute by ramping the master gain to 0 rather than cutting.
    const target = next ? 0 : 1;
    const { ctx, master } = state;
    try {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(target, now + 0.08);
    } catch {
      /* best-effort */
    }
    // Mirror into any procedural-external loop handles (e.g. disco) so
    // they also silence. Buffer-backed loops are already downstream of
    // master, so the master gain ramp covers them.
    for (const h of loopRegistry.values()) {
      if (h.mode === 'procedural-external' && h.external) {
        try {
          h.external.setMuted(next);
        } catch {
          /* ignore */
        }
      }
    }
  },

  isMuted(): boolean {
    return muted;
  },

  isReady(): boolean {
    return !!state && state.ctx.state === 'running';
  },

  warmupSuperuserSounds(): void {
    const s = state;
    if (s) {
      warmupSuperuserWave(s.ctx);
    } else {
      // Defer — run as soon as the first gesture creates the AudioContext.
      superuserWavePending = true;
    }
  },

  primeOnGesture(): void {
    if (typeof window === 'undefined') return;
    // Idempotent — if the state already exists we've already primed.
    if (state) return;
    ensure();
  },

  get __debug(): SoundManagerDiagnostics {
    return {
      buffered: Array.from(bufferCache.keys()),
      inflight: Array.from(warmupInflight),
      attempted: Array.from(warmupAttempted),
      criticalWaveStarted: state !== null,
      secondWaveScheduled,
      superuserWaveScheduled,
    };
  },

  __reset(): void {
    // Stop every active loop first.
    for (const h of loopRegistry.values()) {
      stopLoopHandle(state, h);
    }
    loopRegistry.clear();
    // Pre-empt any in-flight one-shot.
    if (state) preemptActive(state);
    activeOneShot = null;
    if (state) {
      try {
        state.master.disconnect();
        void state.ctx.close();
      } catch {
        /* ignore */
      }
    }
    state = null;
    muted = false;
    bufferCache.clear();
    warmupAttempted.clear();
    warmupInflight.clear();
    bufferReadySubscribers.clear();
    externalLoopFactories.clear();
    secondWaveScheduled = false;
    superuserWaveScheduled = false;
    superuserWavePending = false;
    for (const key of Object.keys(lastPlayedAt)) {
      delete lastPlayedAt[key as SoundId];
    }
  },
};

/** @internal — exposed for unit tests to exercise private helpers. */
export const __test = {
  midiToHz,
  DEBOUNCE_MS,
  VOLUMES,
  /** Diagnostic: is there an active one-shot in flight? */
  hasActiveOneShot: (): boolean => activeOneShot !== null,
  /** Diagnostic: number of active loops. */
  loopCount: (): number => loopRegistry.size,
  /** Test-only: seed the buffer cache (skips the fetch path). */
  seedBuffer: (id: SoundId, buffer: AudioBuffer): void => {
    bufferCache.set(id, buffer);
    notifyBufferReady(id);
  },
};
