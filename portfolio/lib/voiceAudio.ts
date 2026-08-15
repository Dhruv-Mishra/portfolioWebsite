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
}

export function createVoicePlayback(): VoicePlayback {
  let context: AudioContext | null = null;
  let nextTime = 0;
  let tailTimer: ReturnType<typeof setTimeout> | null = null;
  const sources = new Set<AudioBufferSourceNode>();
  const idleListeners = new Set<() => void>();

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

  function emitIdle(): void {
    if (isBusy()) return;
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
      const audio = ensure();
      void audio.resume();
      const samples = new Int16Array(chunk);
      const buffer = audio.createBuffer(1, samples.length, VOICE_AGENT_OUTPUT_RATE);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) {
        channel[index] = (samples[index] ?? 0) / 0x8000;
      }
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
      emitIdle();
    },
    close() {
      this.interrupt();
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
  };
}
