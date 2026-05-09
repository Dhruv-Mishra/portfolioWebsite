"use client";

/**
 * Client wrapper for the Whisper Web Worker.
 *
 * Spawns the worker on first use and exposes a promise-based API. If the
 * Worker cannot be constructed (older browser, blocked by CSP, build-time
 * issue), all calls fall back to the main-thread pipeline so behaviour
 * degrades gracefully.
 */

import {
  WHISPER_MODEL_ID,
  blobToWhisperAudio as _blobToWhisperAudio,
  type WhisperProgress,
} from './whisperShared';

export { WHISPER_MODEL_ID };
export const blobToWhisperAudio = _blobToWhisperAudio;
export type { WhisperProgress };

type Pending = {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  onProgress?: (p: WhisperProgress) => void;
};

type WorkerOutMessage =
  | { type: 'progress'; id: number; progress: WhisperProgress }
  | { type: 'ready'; id: number }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id: number; message: string };

let worker: Worker | null = null;
let workerFailed = false;
const pending = new Map<number, Pending>();
let nextId = 1;

function getWorker(): Worker | null {
  if (workerFailed) return null;
  if (worker) return worker;
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    workerFailed = true;
    return null;
  }
  try {
    worker = new Worker(new URL('./whisperWorker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;
      const p = pending.get(msg.id);
      if (!p) return;
      if (msg.type === 'progress') {
        p.onProgress?.(msg.progress);
      } else if (msg.type === 'result') {
        pending.delete(msg.id);
        p.resolve(msg.text);
      } else if (msg.type === 'ready') {
        pending.delete(msg.id);
        p.resolve('');
      } else if (msg.type === 'error') {
        pending.delete(msg.id);
        p.reject(new Error(msg.message));
      }
    });
    worker.addEventListener('error', () => {
      // If the worker errors fatally, mark failed and reject all pendings.
      workerFailed = true;
      for (const [, p] of pending) p.reject(new Error('whisper-worker-fatal'));
      pending.clear();
      try { worker?.terminate(); } catch { /* no-op */ }
      worker = null;
    });
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

/**
 * Transcribe a 16kHz mono Float32Array. Runs in the Worker when available,
 * falls back to the main-thread pipeline otherwise.
 */
export async function transcribeWithWorker(
  audio: Float32Array,
  opts?: { language?: string; onProgress?: (p: WhisperProgress) => void },
): Promise<string> {
  const w = getWorker();
  if (!w) {
    const { getWhisperPipeline } = await import('./whisperClient');
    const asr = await getWhisperPipeline(opts?.onProgress);
    const decodeOpts: Record<string, unknown> = {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
      temperature: 0,
      no_repeat_ngram_size: 3,
    };
    if (opts?.language) {
      decodeOpts.language = opts.language;
      decodeOpts.task = 'transcribe';
    }
    const out = await asr(audio, decodeOpts);
    const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
    return text.trim();
  }
  return new Promise<string>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, onProgress: opts?.onProgress });
    // Transferring the underlying buffer avoids a copy.
    try {
      w.postMessage(
        { type: 'transcribe', id, model: WHISPER_MODEL_ID, audio, language: opts?.language },
        [audio.buffer],
      );
    } catch {
      // Some browsers reject transferables of certain TypedArrays — fall back to copy.
      try {
        w.postMessage({ type: 'transcribe', id, model: WHISPER_MODEL_ID, audio, language: opts?.language });
      } catch (error) {
        pending.delete(id);
        reject(error instanceof Error ? error : new Error('whisper-worker-post-failed'));
      }
    }
  });
}

/**
 * Best-effort background preload of the model inside the worker. Resolves
 * to `true` on success, `false` on any failure. Never throws.
 */
export function preloadWhisperWorker(onProgress?: (p: WhisperProgress) => void): Promise<boolean> {
  const w = getWorker();
  if (!w) {
    return import('./whisperClient')
      .then((m) => m.preloadWhisperPipeline())
      .catch(() => false);
  }
  return new Promise<boolean>((resolve) => {
    const id = nextId++;
    pending.set(id, {
      resolve: () => resolve(true),
      reject: () => resolve(false),
      onProgress,
    });
    try {
      w.postMessage({ type: 'preload', id, model: WHISPER_MODEL_ID });
    } catch {
      pending.delete(id);
      resolve(false);
    }
  });
}
