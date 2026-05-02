/**
 * Whisper ASR Web Worker.
 *
 * Holds the Transformers.js pipeline singleton off the main thread so the
 * UI never freezes during the 1-3s post-stop transcription on mobile/WASM.
 *
 * NOTE: a Worker does NOT make Whisper "streaming" — Whisper is an
 * encoder-decoder that needs the full clip. The Worker only makes the
 * blocking inference non-blocking from the main thread's perspective.
 *
 * Spawned from {@link ./whisperWorkerClient.ts} via:
 *   `new Worker(new URL('./whisperWorker.ts', import.meta.url), { type: 'module' })`
 * which Next.js 16 / Webpack 5 / Turbopack compile as a separate chunk.
 */

/// <reference lib="webworker" />

import type { WhisperProgress } from './whisperClient';

type AsrPipeline = (
  audio: Float32Array,
  opts?: Record<string, unknown>,
) => Promise<{ text: string } | { text: string }[]>;

type InMessage =
  | { type: 'preload'; id: number; model: string }
  | { type: 'transcribe'; id: number; model: string; audio: Float32Array; language?: string };

type OutMessage =
  | { type: 'progress'; id: number; progress: WhisperProgress }
  | { type: 'ready'; id: number }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let pipelinePromise: Promise<AsrPipeline> | null = null;
let loadedModel: string | null = null;

function loadPipeline(model: string, onProgress: (p: WhisperProgress) => void): Promise<AsrPipeline> {
  if (pipelinePromise && loadedModel === model) return pipelinePromise;
  loadedModel = model;
  pipelinePromise = (async () => {
    const mod = await import('@huggingface/transformers');
    const { pipeline } = mod as unknown as {
      pipeline: (
        task: string,
        model: string,
        opts?: { progress_callback?: (p: WhisperProgress) => void; dtype?: string; device?: string },
      ) => Promise<AsrPipeline>;
    };
    try {
      return await pipeline('automatic-speech-recognition', model, {
        progress_callback: onProgress,
        device: 'webgpu',
      });
    } catch {
      return pipeline('automatic-speech-recognition', model, { progress_callback: onProgress });
    }
  })().catch((err) => {
    pipelinePromise = null;
    loadedModel = null;
    throw err;
  });
  return pipelinePromise;
}

function post(msg: OutMessage): void {
  ctx.postMessage(msg);
}

ctx.addEventListener('message', (event: MessageEvent<InMessage>) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  const onProgress = (p: WhisperProgress): void => {
    post({ type: 'progress', id: msg.id, progress: p });
  };

  if (msg.type === 'preload') {
    loadPipeline(msg.model, onProgress)
      .then(() => post({ type: 'ready', id: msg.id }))
      .catch((err) => post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) }));
    return;
  }

  if (msg.type === 'transcribe') {
    loadPipeline(msg.model, onProgress)
      .then(async (asr) => {
        // Multilingual whisper auto-detects when no `language` is passed.
        // Decoding params chosen for short voice-input clips:
        //   chunk_length_s: 30, stride_length_s: 5 — matches Whisper's
        //     training receptive field and avoids boundary artifacts on
        //     longer dictations.
        //   return_timestamps: false — we only want the transcript.
        //   temperature: 0 — greedy, deterministic, no hallucinated retries.
        //   no_repeat_ngram_size: 3 — kills the classic Whisper repetition
        //     loops ("thank you. thank you. thank you.") on quiet audio.
        // `task` defaults to 'transcribe'. Forcing it when language is
        // unset would short-circuit auto-detect, so we only attach it
        // alongside an explicit language hint.
        const opts: Record<string, unknown> = {
          chunk_length_s: 30,
          stride_length_s: 5,
          return_timestamps: false,
          temperature: 0,
          no_repeat_ngram_size: 3,
        };
        if (msg.language) {
          opts.language = msg.language;
          opts.task = 'transcribe';
        }
        const out = await asr(msg.audio, opts);
        const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
        post({ type: 'result', id: msg.id, text: text.trim() });
      })
      .catch((err) => post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) }));
  }
});

export {};
