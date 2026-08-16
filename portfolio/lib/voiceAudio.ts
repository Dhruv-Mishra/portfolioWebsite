import {
  VOICE_AGENT_INPUT_RATE,
  VOICE_AGENT_OUTPUT_RATE,
  VOICE_AUDIO_FRAME_MS,
  VOICE_LOW_NETWORK_FRAME_MS,
} from '@/lib/voiceAgentConfig';

export interface VoiceCaptureHandle {
  stop: () => void;
}

function downsample(buffer: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) return buffer;
  const ratio = inputRate / outputRate;
  const length = Math.max(1, Math.round(buffer.length / ratio));
  const next = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    next[index] = buffer[Math.min(buffer.length - 1, Math.floor(index * ratio))] ?? 0;
  }
  return next;
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
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(2048, 1, 1);
  const frameMs = options.lowNetwork ? VOICE_LOW_NETWORK_FRAME_MS : VOICE_AUDIO_FRAME_MS;
  const frameSamples = Math.round(VOICE_AGENT_INPUT_RATE * (frameMs / 1000));
  let pending = new Float32Array(0);

  processor.onaudioprocess = event => {
    const input = event.inputBuffer.getChannelData(0);
    const resampled = downsample(input, context.sampleRate, VOICE_AGENT_INPUT_RATE);
    const merged = new Float32Array(pending.length + resampled.length);
    merged.set(pending, 0);
    merged.set(resampled, pending.length);
    let offset = 0;
    while (offset + frameSamples <= merged.length) {
      onFrame(floatToPcm16(merged.subarray(offset, offset + frameSamples)));
      offset += frameSamples;
    }
    pending = merged.subarray(offset);
  };

  const muteGain = context.createGain();
  muteGain.gain.value = 0;
  source.connect(processor);
  processor.connect(muteGain);
  muteGain.connect(context.destination);

  return {
    stop: () => {
      processor.disconnect();
      muteGain.disconnect();
      source.disconnect();
      stream.getTracks().forEach(track => track.stop());
      void context.close();
    },
  };
}

export interface VoicePlayback {
  play(chunk: ArrayBuffer): void;
  interrupt(): void;
  close(): void;
  isBusy(): boolean;
  subscribeIdle(cb: () => void): () => void;
  /** Present on live playback. Optional so unowned runtime mocks stay typed. */
  subscribeLevel?(cb: (level: number) => void): () => void;
  getLevel?(): number;
}

const PLAYBACK_LEVEL_EMA = 0.38;
const PLAYBACK_LEVEL_DECAY = 0.8;
const PLAYBACK_LEVEL_DECAY_MS = 48;
const PLAYBACK_LEVEL_SILENCE = 0.01;

let voicePlaybackLevel = 0;
let voicePlaybackMeterOwner: symbol | null = null;
const voicePlaybackLevelListeners = new Set<(level: number) => void>();

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function measurePcmLevel(samples: Int16Array): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = (samples[index] ?? 0) / 0x8000;
    const abs = sample < 0 ? -sample : sample;
    if (abs > peak) peak = abs;
    sumSq += sample * sample;
  }
  const rms = Math.sqrt(sumSq / samples.length);
  return clamp01(peak * 0.35 + rms * 1.8);
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

export function createVoicePlayback(): VoicePlayback {
  let context: AudioContext | null = null;
  let nextTime = 0;
  let tailTimer: ReturnType<typeof setTimeout> | null = null;
  let decayTimer: ReturnType<typeof setTimeout> | null = null;
  let level = 0;
  const owner = Symbol('voice-playback');
  const sources = new Set<AudioBufferSourceNode>();
  const idleListeners = new Set<() => void>();
  const levelListeners = new Set<(level: number) => void>();

  function ensure(): AudioContext {
    if (!context) {
      context = new AudioContext();
      nextTime = context.currentTime;
    }
    return context;
  }

  function remainingTailMs(): number {
    if (!context) return 0;
    return Math.max(0, (nextTime - context.currentTime) * 1000);
  }

  function isBusy(): boolean {
    if (sources.size > 0) return true;
    return remainingTailMs() > 16;
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
    if (sources.size > 0) return;
    const wait = remainingTailMs();
    if (wait <= 16) {
      emitIdle();
      return;
    }
    tailTimer = setTimeout(() => {
      tailTimer = null;
      if (context) nextTime = context.currentTime;
      emitIdle();
    }, wait + 8);
  }

  return {
    play(chunk: ArrayBuffer) {
      if (chunk.byteLength % 2 !== 0) return;
      const samples = new Int16Array(chunk);
      if (samples.length === 0) return;
      const audio = ensure();
      void audio.resume();
      const buffer = audio.createBuffer(1, samples.length, VOICE_AGENT_OUTPUT_RATE);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) {
        channel[index] = (samples[index] ?? 0) / 0x8000;
      }
      clearDecay();
      emitLevel(level + (measurePcmLevel(samples) - level) * PLAYBACK_LEVEL_EMA, true);
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.connect(audio.destination);
      source.addEventListener('ended', () => {
        sources.delete(source);
        scheduleIdleWatch();
      });
      sources.add(source);
      const startAt = Math.max(audio.currentTime, nextTime);
      source.start(startAt);
      nextTime = startAt + buffer.duration;
      scheduleIdleWatch();
    },
    interrupt() {
      if (tailTimer != null) {
        clearTimeout(tailTimer);
        tailTimer = null;
      }
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
      }
      sources.clear();
      nextTime = context?.currentTime ?? 0;
      beginDecay();
      emitIdle();
    },
    close() {
      this.interrupt();
      clearDecay();
      emitLevel(0, false);
      if (!context) return;
      void context.close();
      context = null;
      nextTime = 0;
    },
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
