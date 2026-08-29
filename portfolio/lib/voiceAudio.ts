import { getEffectiveMasterVolumeSync, subscribeMasterVolume } from '@/hooks/useStickers';
import {
  VOICE_AGENT_INPUT_RATE,
  VOICE_AGENT_OUTPUT_RATE,
  VOICE_AUDIO_FRAME_MS,
  VOICE_LOW_NETWORK_FRAME_MS,
} from '@/lib/voiceAgentConfig';

export interface VoiceCaptureHandle {
  stop: () => void;
}

function createLinearResampler(inputRate: number, outputRate: number) {
  const step = inputRate / outputRate;
  let position = 0;
  let prevSample = 0;

  return {
    push(input: Float32Array): Float32Array {
      if (input.length === 0) return input;
      if (step === 1 && position === 0) {
        prevSample = input[input.length - 1] ?? 0;
        return input;
      }

      let count = 0;
      for (let cursor = position; Math.floor(cursor) + 1 < input.length; cursor += step) {
        count += 1;
      }
      const output = new Float32Array(count);
      for (let written = 0; written < count; written += 1) {
        const index = Math.floor(position);
        const nextIndex = index + 1;
        const s0 = index < 0 ? prevSample : (input[index] ?? 0);
        const s1 = input[nextIndex] ?? 0;
        output[written] = s0 + (s1 - s0) * (position - index);
        position += step;
      }

      prevSample = input[input.length - 1] ?? prevSample;
      position -= input.length;
      return output;
    },
  };
}

function floatToPcm16(buffer: Float32Array): ArrayBuffer {
  const view = new DataView(new ArrayBuffer(buffer.length * 2));
  for (let index = 0; index < buffer.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, buffer[index] ?? 0));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return view.buffer;
}

export async function startVoiceCapture(
  onFrame: (chunk: ArrayBuffer) => void,
  options: { lowNetwork?: boolean } = {},
): Promise<VoiceCaptureHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
      channelCount: 1,
    },
  });

  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let processor: ScriptProcessorNode | null = null;
  let muteGain: GainNode | null = null;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (processor) processor.onaudioprocess = null;
    try { processor?.disconnect(); } catch { /* already disconnected */ }
    try { muteGain?.disconnect(); } catch { /* already disconnected */ }
    try { source?.disconnect(); } catch { /* already disconnected */ }
    for (const track of stream.getTracks()) {
      try { track.stop(); } catch { /* already stopped */ }
    }
    if (context && context.state !== 'closed') {
      void context.close().catch(() => {});
    }
  };

  try {
    context = new AudioContext();
    if (context.state !== 'running') {
      await context.resume();
    }
    if (context.state !== 'running') {
      throw new Error('Voice capture audio context failed to run');
    }

    source = context.createMediaStreamSource(stream);
    processor = context.createScriptProcessor(2048, 1, 1);
    muteGain = context.createGain();
    muteGain.gain.value = 0;

    const frameMs = options.lowNetwork ? VOICE_LOW_NETWORK_FRAME_MS : VOICE_AUDIO_FRAME_MS;
    const frameSamples = Math.round(VOICE_AGENT_INPUT_RATE * (frameMs / 1000));
    const resampler = createLinearResampler(context.sampleRate, VOICE_AGENT_INPUT_RATE);
    let pending = new Float32Array(0);

    processor.onaudioprocess = event => {
      if (stopped) return;
      const input = event.inputBuffer.getChannelData(0);
      const resampled = resampler.push(input);
      const merged = new Float32Array(pending.length + resampled.length);
      merged.set(pending, 0);
      merged.set(resampled, pending.length);
      let offset = 0;
      while (offset + frameSamples <= merged.length) {
        onFrame(floatToPcm16(merged.subarray(offset, offset + frameSamples)));
        offset += frameSamples;
      }
      pending = new Float32Array(merged.subarray(offset));
    };

    source.connect(processor);
    processor.connect(muteGain);
    muteGain.connect(context.destination);
  } catch (error) {
    stop();
    throw error;
  }

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
export const VOICE_PLAYBACK_MAX_QUEUE_S = 2;
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
  let context: AudioContext | null = null;
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

  function fadeMasterIn(): void {
    if (!master || !context || fadedIn) return;
    const now = context.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(0, now);
      master.gain.linearRampToValueAtTime(targetVolume, now + VOICE_PLAYBACK_FADE_IN_S);
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

  function ensure(): AudioContext | null {
    if (closed || resumeFailed) return null;
    if (!context) {
      context = new AudioContext();
      nextTime = 0;
      started = false;
      if (typeof context.createGain === 'function') {
        master = context.createGain();
        targetVolume = getEffectiveMasterVolumeSync();
        master.gain.value = 0;
        master.connect(context.destination);
        volumeUnsubscribe = subscribeMasterVolume(applyMasterVolume);
      }
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

  function queuedFutureSeconds(): number {
    if (!context || !started) return pendingSamples / VOICE_AGENT_OUTPUT_RATE;
    return Math.max(0, nextTime - context.currentTime) + pendingSamples / VOICE_AGENT_OUTPUT_RATE;
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

  function dropOldestPending(neededSamples: number): void {
    let remaining = neededSamples;
    while (remaining > 0 && pending.length > 0) {
      const head = pending[0];
      if (!head) break;
      if (head.length <= remaining) {
        pending.shift();
        pendingSamples -= head.length;
        remaining -= head.length;
        continue;
      }
      pending[0] = head.subarray(remaining);
      pendingSamples -= remaining;
      remaining = 0;
    }
  }

  function canOutput(audio: AudioContext): boolean {
    return audio.state !== 'suspended' && audio.state !== 'closed';
  }

  function enqueueSamples(samples: Float32Array): boolean {
    pending.push(samples);
    pendingSamples += samples.length;
    const future = queuedFutureSeconds();
    if (future <= VOICE_PLAYBACK_MAX_QUEUE_S) return false;
    const overflowSamples = Math.ceil((future - VOICE_PLAYBACK_MAX_QUEUE_S) * VOICE_AGENT_OUTPUT_RATE);
    if (pendingSamples > overflowSamples) {
      dropOldestPending(overflowSamples);
      return false;
    }
    pending = [samples];
    pendingSamples = samples.length;
    fadeMasterOut();
    stopSources();
    started = false;
    nextTime = context?.currentTime ?? 0;
    return true;
  }

  function scheduleSource(audio: AudioContext, samples: Float32Array): void {
    if (closed || samples.length === 0) return;
    const maxSamples = Math.round(VOICE_PLAYBACK_MAX_QUEUE_S * VOICE_AGENT_OUTPUT_RATE);
    const clipped = samples.length > maxSamples
      ? samples.subarray(samples.length - maxSamples)
      : samples;
    const buffer = audio.createBuffer(1, clipped.length, VOICE_AGENT_OUTPUT_RATE);
    buffer.getChannelData(0).set(clipped);
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
    fadeMasterIn();
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
        flushPending(false);
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
    const resync = enqueueSamples(decoded.samples);
    flushPending(resync);
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
    const stopAt = context ? context.currentTime + VOICE_PLAYBACK_FADE_OUT_S : undefined;
    stopSources(stopAt);
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
