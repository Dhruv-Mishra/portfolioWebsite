"use client";

const MODEL_ID = 'Xenova/whisper-tiny';

export type WhisperProgress = {
  status: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
};

const LOG_RAW =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_LOG_RAW === 'true';

/** Fire-and-forget server beacon. No-op when `NEXT_PUBLIC_LOG_RAW !== 'true'`. */
export function beacon(event: string, detail?: Record<string, unknown>): void {
  if (!LOG_RAW) return;
  if (typeof navigator === 'undefined') return;
  try {
    const body = JSON.stringify({ event, detail });
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/log/voice', blob);
    } else {
      void fetch('/api/log/voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* swallow */
  }
}

/**
 * Decode a recorded audio Blob into a 16kHz mono Float32Array, the shape
 * Whisper expects. Uses an OfflineAudioContext to resample.
 */
export async function blobToWhisperAudio(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = getAudioContextConstructor();
  if (!AudioCtx) throw new Error('Web Audio API not supported');

  const ctx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    void ctx.close();
  }

  const targetRate = 16000;
  const length = Math.max(1, Math.ceil(decoded.duration * targetRate));
  const OfflineAudioCtx = getOfflineAudioContextConstructor();
  if (!OfflineAudioCtx) throw new Error('Offline audio rendering is not supported');
  const offline = new OfflineAudioCtx(1, length, targetRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);

  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] < 0 ? -samples[i] : samples[i];
    if (v > peak) peak = v;
  }
  if (peak > 0 && peak < 0.99) {
    const gain = 0.99 / peak;
    for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  }
  return samples;
}

export function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const audioWindow = window as WebAudioWindow;
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

export function getOfflineAudioContextConstructor(): typeof OfflineAudioContext | null {
  if (typeof window === 'undefined') return null;
  const audioWindow = window as WebAudioWindow;
  return audioWindow.OfflineAudioContext ?? audioWindow.webkitOfflineAudioContext ?? null;
}

export function hasWhisperAudioSupport(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof window.MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!getAudioContextConstructor() &&
    !!getOfflineAudioContextConstructor();
}

/**
 * Pick a MediaRecorder MIME type the current browser supports.
 * iOS Safari only supports `audio/mp4`; Chromium/Firefox prefer opus.
 */
export function pickAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
  ];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* no-op */
    }
  }
  return undefined;
}

export const WHISPER_MODEL_ID = MODEL_ID;

/** Internal helper for consumers (hooks) to emit transcription beacons. */
export function logVoiceEvent(event: string, detail?: Record<string, unknown>): void {
  if (LOG_RAW) {
    console.info(`[voice] ${event}`, detail ?? '');
  }
  beacon(event, detail);
}