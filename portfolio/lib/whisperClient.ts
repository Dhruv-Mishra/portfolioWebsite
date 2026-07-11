"use client";

/**
 * Lazy-loaded singleton for Transformers.js ASR pipeline.
 *
 * Model: `Xenova/whisper-tiny` — multilingual (99 languages, ~39M params).
 * Smallest viable Whisper variant; faster inference than `whisper-base` at
 * the cost of some accuracy (especially on short clips / non-English speech).
 * Runs via WebGPU when available, otherwise WASM SIMD.
 *
 * Weights are fetched from Hugging Face (NOT this origin) and cached through
 * the browser Cache API after the first load. The pipeline + ONNX runtime +
 * tokenizer assets are dynamic-imported so they never land in the main bundle.
 */

import {
  WHISPER_MODEL_ID as MODEL_ID,
  beacon,
  type WhisperProgress,
} from './whisperShared';

export {
  WHISPER_MODEL_ID,
  blobToWhisperAudio,
  logVoiceEvent,
  pickAudioMimeType,
} from './whisperShared';
export type { WhisperProgress } from './whisperShared';

type AsrPipeline = (
  audio: Float32Array,
  opts?: Record<string, unknown>,
) => Promise<{ text: string } | { text: string }[]>;

let pipelinePromise: Promise<AsrPipeline> | null = null;

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
 * Best-effort background preload of the ASR pipeline. Returns a promise
 * that resolves to `true` once cached/ready, or `false` if loading failed
 * (e.g. offline). Never throws — safe to fire-and-forget.
 */
export function preloadWhisperPipeline(): Promise<boolean> {
  return getWhisperPipeline().then(() => true).catch(() => false);
}
