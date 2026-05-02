"use client";

/**
 * Lazy-loaded singleton for Transformers.js ASR pipeline.
 *
 * Model: `Xenova/whisper-tiny` — multilingual (99 languages, ~39M params,
 * ~30-40MB quantized). Smallest viable Whisper variant; faster inference
 * and lighter download than `whisper-base` at the cost of some accuracy
 * (especially on short clips / non-English speech). Runs via WebGPU when
 * available, otherwise WASM SIMD.
 *
 * Weights are fetched from huggingface.co (NOT this origin) and cached in
 * IndexedDB after the first load. The pipeline + ONNX runtime + tokenizer
 * assets are dynamic-imported so they never land in the main bundle.
 */

const MODEL_ID = 'Xenova/whisper-tiny';

type AsrPipeline = (
  audio: Float32Array,
  opts?: Record<string, unknown>,
) => Promise<{ text: string } | { text: string }[]>;

export type WhisperProgress = {
  status: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

let pipelinePromise: Promise<AsrPipeline> | null = null;

const LOG_RAW =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_LOG_RAW === 'true';

/** Fire-and-forget server beacon. No-op when `NEXT_PUBLIC_LOG_RAW !== 'true'`. */
function beacon(event: string, detail?: Record<string, unknown>): void {
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

let lastLoggedProgress = -1;

/**
 * Return the cached ASR pipeline, loading it on first call.
 * `onProgress` is invoked during the initial model download only.
 */
export function getWhisperPipeline(
  onProgress?: (p: WhisperProgress) => void,
): Promise<AsrPipeline> {
  if (!pipelinePromise) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
     
    console.info(`[voice] whisper model load starting (${MODEL_ID})`);
    beacon('model-load-start', { model: MODEL_ID });

    pipelinePromise = (async () => {
      const mod = await import('@huggingface/transformers');
      const { pipeline } = mod as unknown as {
        pipeline: (
          task: string,
          model: string,
          opts?: { progress_callback?: (p: WhisperProgress) => void; dtype?: string; device?: string },
        ) => Promise<AsrPipeline>;
      };

      const wrappedProgress = (p: WhisperProgress) => {
        if (typeof p.progress === 'number') {
          const pct = Math.floor(p.progress);
          if (pct >= lastLoggedProgress + 10 && pct <= 100) {
            lastLoggedProgress = pct;
             
            console.info(`[voice] downloading model: ${pct}%`);
          }
        }
        onProgress?.(p);
      };

      try {
        // Prefer WebGPU when available; fall back to WASM automatically.
        return await pipeline('automatic-speech-recognition', MODEL_ID, {
          progress_callback: wrappedProgress,
          device: 'webgpu',
        });
      } catch {
        return pipeline('automatic-speech-recognition', MODEL_ID, {
          progress_callback: wrappedProgress,
        });
      }
    })()
      .then((p) => {
        const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
         
        console.info(`[voice] whisper model ready (${MODEL_ID}, cached, ${ms}ms)`);
        beacon('model-load-complete', { model: MODEL_ID, durationMs: ms });
        return p;
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
         
        console.warn(`[voice] whisper model load failed: ${message}`);
        beacon('model-load-failed', { model: MODEL_ID, error: message });
        // Reset so a future call can retry rather than re-throwing the cached failure.
        pipelinePromise = null;
        throw err;
      });
  }
  return pipelinePromise;
}

/**
 * Decode a recorded audio Blob into a 16kHz mono Float32Array, the shape
 * Whisper expects. Uses an OfflineAudioContext to resample.
 */
export async function blobToWhisperAudio(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
  const offline = new OfflineAudioContext(1, length, targetRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);

  // Peak-normalize to [-1, 1]. Whisper benefits noticeably from a clean,
  // full-scale input — quiet recordings (built-in mic, far field) otherwise
  // get padded toward silence after mel-spectrogram normalization and the
  // decoder hallucinates short outputs (`you`, `.`, etc).
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

/**
 * Best-effort background preload of the ASR pipeline. Returns a promise
 * that resolves to `true` once cached/ready, or `false` if loading failed
 * (e.g. offline). Never throws — safe to fire-and-forget.
 */
export function preloadWhisperPipeline(): Promise<boolean> {
  return getWhisperPipeline().then(() => true).catch(() => false);
}
