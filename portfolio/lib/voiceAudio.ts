import { getEffectiveMasterVolumeSync, subscribeMasterVolume } from '@/hooks/useStickers';
import { SITE_VERSION } from '@/lib/siteVersion';
import {
  VOICE_AGENT_INPUT_RATE,
  VOICE_AGENT_OUTPUT_RATE,
  VOICE_AUDIO_FRAME_MS,
  VOICE_LOW_NETWORK_FRAME_MS,
} from '@/lib/voiceAgentConfig';
import {
  createVoiceAudioContext,
  takePrimedVoiceCaptureContext,
  takePrimedVoicePlaybackContext,
} from '@/lib/voiceAudioActivation';

export interface VoiceCaptureHandle {
  stop: () => void;
}

const pendingVoiceCaptureCancels = new Set<() => void>();

export function cancelPendingVoiceCaptures(): void {
  for (const cancel of [...pendingVoiceCaptureCancels]) {
    pendingVoiceCaptureCancels.delete(cancel);
    cancel();
  }
}

export async function startVoiceCapture(
  onFrame: (chunk: ArrayBuffer) => void,
  options: { lowNetwork?: boolean } = {},
): Promise<VoiceCaptureHandle> {
  let context: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let worklet: AudioWorkletNode | null = null;
  let muteGain: GainNode | null = null;
  let stopped = false;
  let stoppedStream: MediaStream | null = null;

  const stopStreamTracks = () => {
    if (!stream || stream === stoppedStream) return;
    stoppedStream = stream;
    for (const track of stream.getTracks()) {
      try { track.stop(); } catch { /* already stopped */ }
    }
  };

  const stop = () => {
    if (stopped) {
      stopStreamTracks();
      return;
    }
    stopped = true;
    if (worklet) worklet.port.onmessage = null;
    try { worklet?.port.close(); } catch { /* already closed */ }
    try { worklet?.disconnect(); } catch { /* already disconnected */ }
    try { muteGain?.disconnect(); } catch { /* already disconnected */ }
    try { source?.disconnect(); } catch { /* already disconnected */ }
    stopStreamTracks();
    if (context && context.state !== 'closed') {
      void context.close().catch(() => {});
    }
  };

  const throwIfStopped = () => {
    if (!stopped) return;
    stop();
    throw new Error('Voice capture start cancelled');
  };

  try {
    context = takePrimedVoiceCaptureContext()
      ?? createVoiceAudioContext(VOICE_AGENT_INPUT_RATE);
    pendingVoiceCaptureCancels.add(stop);
    const resume = context.resume().then(
      () => ({ ok: true as const }),
      error => ({ ok: false as const, error }),
    );
    const streamRequest = navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    stream = await streamRequest;
    throwIfStopped();
    const resumeResult = await resume;
    if (!resumeResult.ok) throw resumeResult.error;
    throwIfStopped();
    if (context.state !== 'running') {
      throw new Error('Voice capture audio context failed to run');
    }

    const frameMs = options.lowNetwork ? VOICE_LOW_NETWORK_FRAME_MS : VOICE_AUDIO_FRAME_MS;
    const frameSamples = Math.round(VOICE_AGENT_INPUT_RATE * (frameMs / 1000));
    await context.audioWorklet.addModule(`/voice/voice-capture-processor.js?v=${SITE_VERSION}`);
    throwIfStopped();

    source = context.createMediaStreamSource(stream);
    worklet = new AudioWorkletNode(context, 'voice-capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { frameSamples },
    });
    muteGain = context.createGain();
    muteGain.gain.value = 0;
    worklet.port.onmessage = event => {
      if (!stopped && event.data instanceof ArrayBuffer) onFrame(event.data);
    };

    source.connect(worklet);
    worklet.connect(muteGain);
    muteGain.connect(context.destination);
  } catch (error) {
    stop();
    pendingVoiceCaptureCancels.delete(stop);
    throw error;
  }

  pendingVoiceCaptureCancels.delete(stop);
  return { stop };
}

export interface VoicePlayback {
  play(chunk: ArrayBuffer): void;
  /** Flush a short reply that never reached the initial prebuffer. */
  finishTurn?(): void;
  interrupt(): void;
  close(): void;
  isBusy(): boolean;
  subscribeIdle(cb: () => void): () => void;
  /** Present on live playback. Optional so unowned runtime mocks stay typed. */
  subscribeLevel?(cb: (level: number) => void): () => void;
  getLevel?(): number;
}

export interface VoicePlaybackOptions {
  onResumeError?: () => void;
}

export const VOICE_PLAYBACK_HANGOVER_MS = 320;
export const VOICE_PLAYBACK_PREBUFFER_MS = 72;
export const VOICE_PLAYBACK_SCHEDULE_LEAD_S = 0.02;
export const VOICE_PLAYBACK_FADE_IN_S = 0.006;
export const VOICE_PLAYBACK_FADE_OUT_S = 0.008;
export const VOICE_PLAYBACK_UNDERRUN_SLACK_S = 0.005;

const PLAYBACK_LEVEL_EMA = 0.38;
const PLAYBACK_LEVEL_DECAY = 0.8;
const PLAYBACK_LEVEL_DECAY_MS = 48;
const PLAYBACK_LEVEL_SILENCE = 0.01;
const PCM16_BYTES = 2;
const PCM16_SCALE = 0x8000;

let voicePlaybackLevel = 0;
let voicePlaybackMeterOwner: symbol | null = null;
const voicePlaybackLevelListeners = new Set<(level: number) => void>();

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function measurePcmLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    const abs = sample < 0 ? -sample : sample;
    if (abs > peak) peak = abs;
    sumSq += sample * sample;
  }
  const rms = Math.sqrt(sumSq / samples.length);
  return clamp01(peak * 0.35 + rms * 1.8);
}

export type Pcm16LeDecodeResult =
  | { ok: true; samples: Float32Array }
  | { ok: false; reason: 'empty' | 'odd-length' };

export function decodePcm16Le(chunk: ArrayBuffer): Pcm16LeDecodeResult {
  if (chunk.byteLength === 0) return { ok: false, reason: 'empty' };
  if (chunk.byteLength % PCM16_BYTES !== 0) return { ok: false, reason: 'odd-length' };
  const view = new DataView(chunk);
  const count = chunk.byteLength / PCM16_BYTES;
  const samples = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    samples[index] = view.getInt16(index * PCM16_BYTES, true) / PCM16_SCALE;
  }
  return { ok: true, samples };
}

function publishVoicePlaybackLevel(owner: symbol, level: number, claim: boolean): void {
  if (claim && level > 0) {
    voicePlaybackMeterOwner = owner;
  } else if (voicePlaybackMeterOwner !== owner) {
    return;
  }
  if (level <= 0) voicePlaybackMeterOwner = null;
  const next = clamp01(level);
  if (next === voicePlaybackLevel) return;
  voicePlaybackLevel = next;
  for (const listener of voicePlaybackLevelListeners) listener(next);
}

export function getVoicePlaybackLevel(): number {
  return voicePlaybackLevel;
}

export function subscribeVoicePlaybackLevel(cb: (level: number) => void): () => void {
  voicePlaybackLevelListeners.add(cb);
  return () => {
    voicePlaybackLevelListeners.delete(cb);
  };
}

export function createVoicePlayback(options: VoicePlaybackOptions = {}): VoicePlayback {
  let context: AudioContext | null = takePrimedVoicePlaybackContext();
  let master: GainNode | null = null;
  let volumeUnsubscribe: (() => void) | null = null;
  let nextTime = 0;
  let targetVolume = 1;
  let fadedIn = false;
  let closed = false;
  let resuming = false;
  let resumeFailed = false;
  let pending: Float32Array[] = [];
  let pendingSamples = 0;
  let started = false;
  let tailTimer: ReturnType<typeof setTimeout> | null = null;
  let prebufferTimer: ReturnType<typeof setTimeout> | null = null;
  let hangoverTimer: ReturnType<typeof setTimeout> | null = null;
  let hangoverUntil = 0;
  let decayTimer: ReturnType<typeof setTimeout> | null = null;
  let level = 0;
  const owner = Symbol('voice-playback');
  const sources = new Set<AudioBufferSourceNode>();
  const idleListeners = new Set<() => void>();
  const levelListeners = new Set<(level: number) => void>();
  const prebufferSamples = Math.round(
    VOICE_AGENT_OUTPUT_RATE * (VOICE_PLAYBACK_PREBUFFER_MS / 1000),
  );

  function applyMasterVolume(volume: number): void {
    targetVolume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;
    if (!master || closed || !fadedIn) return;
    const now = context?.currentTime ?? 0;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(targetVolume, now + 0.04);
    } catch {
      master.gain.value = targetVolume;
    }
  }

  function fadeMasterIn(startAt: number): void {
    if (!master || !context || fadedIn) return;
    try {
      master.gain.cancelScheduledValues(startAt);
      master.gain.setValueAtTime(0, startAt);
      master.gain.linearRampToValueAtTime(targetVolume, startAt + VOICE_PLAYBACK_FADE_IN_S);
    } catch {
      master.gain.value = targetVolume;
    }
    fadedIn = true;
  }

  function fadeMasterOut(): void {
    if (!master || !context) return;
    const now = context.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + VOICE_PLAYBACK_FADE_OUT_S);
    } catch {
      master.gain.value = 0;
    }
    fadedIn = false;
  }

  function initializeContext(audio: AudioContext): void {
    nextTime = 0;
    started = false;
    if (typeof audio.createGain === 'function') {
      master = audio.createGain();
      targetVolume = getEffectiveMasterVolumeSync();
      master.gain.value = 0;
      master.connect(audio.destination);
      volumeUnsubscribe = subscribeMasterVolume(applyMasterVolume);
    }
  }

  if (context) initializeContext(context);

  function ensure(): AudioContext | null {
    if (closed || resumeFailed) return null;
    if (!context) {
      context = createVoiceAudioContext(VOICE_AGENT_OUTPUT_RATE);
      initializeContext(context);
    }
    return context;
  }

  function remainingTailMs(): number {
    if (!context || !started) return 0;
    return Math.max(0, (nextTime - context.currentTime) * 1000);
  }

  function hangoverRemainingMs(): number {
    return Math.max(0, hangoverUntil - Date.now());
  }

  function isBusy(): boolean {
    if (closed || resumeFailed) return false;
    if (pendingSamples > 0) return true;
    if (sources.size > 0) return true;
    if (remainingTailMs() > 16) return true;
    return hangoverRemainingMs() > 0;
  }

  function clearPrebufferTimer(): void {
    if (prebufferTimer == null) return;
    clearTimeout(prebufferTimer);
    prebufferTimer = null;
  }

  function armPrebufferFlush(): void {
    if (prebufferTimer != null || started || closed || resumeFailed) return;
    prebufferTimer = setTimeout(() => {
      prebufferTimer = null;
      flushPending(true);
    }, VOICE_PLAYBACK_PREBUFFER_MS);
  }

  function clearHangoverTimer(): void {
    if (hangoverTimer == null) return;
    clearTimeout(hangoverTimer);
    hangoverTimer = null;
  }

  function clearHangover(): void {
    clearHangoverTimer();
    hangoverUntil = 0;
  }

  function emitLevel(next: number, claim: boolean): void {
    const clamped = clamp01(next);
    const changed = clamped !== level;
    level = clamped;
    publishVoicePlaybackLevel(owner, clamped, claim);
    if (!changed) return;
    for (const listener of levelListeners) listener(clamped);
  }

  function clearDecay(): void {
    if (decayTimer == null) return;
    clearTimeout(decayTimer);
    decayTimer = null;
  }

  function beginDecay(): void {
    if (decayTimer != null) return;
    if (level <= PLAYBACK_LEVEL_SILENCE) {
      if (level !== 0) emitLevel(0, false);
      return;
    }
    decayTimer = setTimeout(() => {
      decayTimer = null;
      if (level <= PLAYBACK_LEVEL_SILENCE) {
        emitLevel(0, false);
        return;
      }
      emitLevel(level * PLAYBACK_LEVEL_DECAY, false);
      beginDecay();
    }, PLAYBACK_LEVEL_DECAY_MS);
  }

  function emitIdle(): void {
    if (isBusy()) return;
    beginDecay();
    for (const listener of idleListeners) listener();
  }

  function scheduleIdleWatch(): void {
    if (tailTimer != null) {
      clearTimeout(tailTimer);
      tailTimer = null;
    }
    clearHangoverTimer();
    if (closed) return;
    if (pendingSamples > 0 || sources.size > 0) return;
    const wait = remainingTailMs();
    if (wait > 16) {
      tailTimer = setTimeout(() => {
        tailTimer = null;
        if (context && started) {
          started = false;
          nextTime = context.currentTime;
        }
        scheduleIdleWatch();
      }, wait + 8);
      return;
    }
    const hangoverWait = hangoverRemainingMs();
    if (hangoverWait > 0) {
      hangoverTimer = setTimeout(() => {
        hangoverTimer = null;
        hangoverUntil = 0;
        emitIdle();
      }, hangoverWait);
      return;
    }
    emitIdle();
  }

  function concatPending(): Float32Array {
    if (pending.length === 1) return pending[0] ?? new Float32Array(0);
    const merged = new Float32Array(pendingSamples);
    let offset = 0;
    for (const chunk of pending) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }

  function canOutput(audio: AudioContext): boolean {
    return audio.state !== 'suspended' && audio.state !== 'closed';
  }

  function enqueueSamples(samples: Float32Array): void {
    pending.push(samples);
    pendingSamples += samples.length;
  }

  function scheduleSource(audio: AudioContext, samples: Float32Array): void {
    if (closed || samples.length === 0) return;
    const buffer = audio.createBuffer(1, samples.length, VOICE_AGENT_OUTPUT_RATE);
    buffer.getChannelData(0).set(samples);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(master ?? audio.destination);
    source.addEventListener('ended', () => {
      if (closed) return;
      sources.delete(source);
      scheduleIdleWatch();
    });
    sources.add(source);
    const now = audio.currentTime;
    let startAt: number;
    if (!started || nextTime <= now + VOICE_PLAYBACK_UNDERRUN_SLACK_S) {
      startAt = now + VOICE_PLAYBACK_SCHEDULE_LEAD_S;
      started = true;
    } else {
      startAt = nextTime;
    }
    fadeMasterIn(startAt);
    source.start(startAt);
    nextTime = startAt + buffer.duration;
    hangoverUntil = Math.max(
      hangoverUntil,
      Date.now() + remainingTailMs() + VOICE_PLAYBACK_HANGOVER_MS,
    );
    scheduleIdleWatch();
  }

  function flushPending(force: boolean): void {
    if (closed || resumeFailed || pendingSamples === 0) return;
    const audio = ensure();
    if (!audio || !canOutput(audio)) return;
    if (!force && !started && pendingSamples < prebufferSamples) return;
    clearPrebufferTimer();
    const samples = concatPending();
    pending = [];
    pendingSamples = 0;
    scheduleSource(audio, samples);
  }

  function noteResumeFailure(): void {
    if (closed || resumeFailed) return;
    resumeFailed = true;
    pending = [];
    pendingSamples = 0;
    clearPrebufferTimer();
    options.onResumeError?.();
  }

  function requestResume(audio: AudioContext): void {
    if (closed || resumeFailed || resuming) return;
    if (audio.state === 'running') return;
    resuming = true;
    void audio.resume().then(
      () => {
        resuming = false;
        if (closed || resumeFailed) return;
        if (audio.state !== 'running') {
          noteResumeFailure();
          return;
        }
        flushPending(true);
      },
      () => {
        resuming = false;
        noteResumeFailure();
      },
    );
  }

  function acceptChunk(chunk: ArrayBuffer): void {
    if (closed || resumeFailed) return;
    const decoded = decodePcm16Le(chunk);
    if (!decoded.ok) return;
    const audio = ensure();
    if (!audio) return;
    requestResume(audio);
    clearDecay();
    emitLevel(level + (measurePcmLevel(decoded.samples) - level) * PLAYBACK_LEVEL_EMA, true);
    enqueueSamples(decoded.samples);
    flushPending(false);
    if (pendingSamples > 0) {
      armPrebufferFlush();
      hangoverUntil = Math.max(hangoverUntil, Date.now() + VOICE_PLAYBACK_HANGOVER_MS);
      scheduleIdleWatch();
    }
  }

  function finishTurn(): void {
    if (closed || resumeFailed) return;
    flushPending(true);
  }

  function stopSources(at?: number): void {
    for (const source of sources) {
      try {
        if (typeof at === 'number') source.stop(at);
        else source.stop();
      } catch {
        /* already stopped */
      }
    }
    sources.clear();
  }

  function interrupt(): void {
    if (closed) return;
    pending = [];
    pendingSamples = 0;
    clearPrebufferTimer();
    if (tailTimer != null) {
      clearTimeout(tailTimer);
      tailTimer = null;
    }
    hangoverUntil = Date.now() + VOICE_PLAYBACK_HANGOVER_MS;
    fadeMasterOut();
    stopSources();
    started = false;
    nextTime = context?.currentTime ?? 0;
    beginDecay();
    scheduleIdleWatch();
  }

  function close(): void {
    if (closed) return;
    closed = true;
    pending = [];
    pendingSamples = 0;
    clearPrebufferTimer();
    if (tailTimer != null) {
      clearTimeout(tailTimer);
      tailTimer = null;
    }
    clearHangover();
    clearDecay();
    emitLevel(0, false);
    fadeMasterOut();
    stopSources(context ? context.currentTime + VOICE_PLAYBACK_FADE_OUT_S : undefined);
    if (volumeUnsubscribe) {
      volumeUnsubscribe();
      volumeUnsubscribe = null;
    }
    if (master) {
      try { master.disconnect(); } catch { /* already disconnected */ }
      master = null;
    }
    started = false;
    nextTime = 0;
    if (context) {
      const closing = context;
      context = null;
      void closing.close().catch(() => { /* already closed */ });
    }
  }

  return {
    play(chunk: ArrayBuffer) {
      acceptChunk(chunk);
    },
    finishTurn,
    interrupt,
    close,
    isBusy,
    subscribeIdle(cb) {
      idleListeners.add(cb);
      return () => {
        idleListeners.delete(cb);
      };
    },
    subscribeLevel(cb) {
      levelListeners.add(cb);
      return () => {
        levelListeners.delete(cb);
      };
    },
    getLevel() {
      return level;
    },
  };
}
