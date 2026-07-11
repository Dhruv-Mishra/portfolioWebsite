import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { performance } from 'node:perf_hooks';

import { adaptTextForSpeech } from '../lib/ttsPrompts';

const DEFAULT_TEXT = 'Hello from local Pocket TTS. The Python worker is loaded and speaking.';
const OUTPUT_PATH = process.env.LOCAL_TTS_OUTPUT ?? path.join('tmp', 'local-tts-smoke.wav');
const SAMPLE_RATE = 24_000;

interface WorkerChunkMessage {
  audioBase64: string;
  id: string;
  index: number;
  sampleRate: number;
  type: 'chunk';
}

interface WorkerDoneMessage {
  audioSeconds: number;
  durationMs: number;
  id: string;
  sampleRate: number;
  type: 'done';
}

interface WorkerErrorMessage {
  id: string;
  message?: string;
  type: 'error';
}

type WorkerMessage = WorkerChunkMessage | WorkerDoneMessage | WorkerErrorMessage;

function getPythonExecutable(): string {
  if (process.env.LOCAL_TTS_PYTHON?.trim()) return process.env.LOCAL_TTS_PYTHON.trim();
  const venvPython = process.platform === 'win32' ? path.join('Scripts', 'python.exe') : path.join('bin', 'python');
  const candidates = [path.join(process.cwd(), '.venv', venvPython), path.join(process.cwd(), '..', '.venv', venvPython)];
  return candidates.find(candidate => existsSync(candidate)) ?? (process.platform === 'win32' ? 'python' : 'python3');
}

function resolveText(): string {
  return process.argv.slice(2).join(' ').trim() || process.env.LOCAL_TTS_TEXT || DEFAULT_TEXT;
}

function encodePcm16Wav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function requestWorker(text: string): Promise<{ audio: Buffer; done: WorkerDoneMessage; firstChunkMs: number }> {
  const workerScript = path.join(process.cwd(), 'scripts', 'pocket-tts-worker.py');
  const worker = spawn(getPythonExecutable(), ['-u', workerScript], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const startedAt = performance.now();
  const audioChunks: Buffer[] = [];
  let firstChunkMs = 0;

  worker.stderr.on('data', chunk => {
    const message = String(chunk).trim();
    if (message) console.warn('[tts:smoke:worker]', message);
  });

  try {
    const done = await new Promise<WorkerDoneMessage>((resolve, reject) => {
      const lines = readline.createInterface({ input: worker.stdout });
      let settled = false;
      const settle = (handler: () => void) => {
        if (settled) return;
        settled = true;
        lines.close();
        handler();
      };
      worker.once('error', error => settle(() => reject(error)));
      worker.once('exit', (code, signal) => settle(() => reject(new Error(`Pocket TTS worker exited before completion (${signal ?? code ?? 'unknown'}).`))));
      lines.on('line', line => {
        try {
          const message = JSON.parse(line) as WorkerMessage;
          if (message.type === 'error') return settle(() => reject(new Error(message.message ?? 'Pocket TTS worker failed.')));
          if (message.type === 'chunk') {
            if (!firstChunkMs) firstChunkMs = Math.round(performance.now() - startedAt);
            audioChunks.push(Buffer.from(message.audioBase64, 'base64'));
            return;
          }
          settle(() => resolve(message));
        } catch (error) {
          settle(() => reject(error instanceof Error ? error : new Error('Worker emitted invalid JSON.')));
        }
      });
      worker.stdin.write(`${JSON.stringify({ id: 'smoke', type: 'synthesize', text, speed: 1, voice: 'custom-dhruv' })}\n`);
    });
    return { audio: Buffer.concat(audioChunks), done, firstChunkMs };
  } finally {
    worker.stdin.end();
    if (!worker.killed) worker.kill();
  }
}

async function main(): Promise<void> {
  const text = adaptTextForSpeech(resolveText());
  console.log('[tts:smoke] Loading Pocket TTS worker...', { voice: 'custom-dhruv' });
  const startedAt = performance.now();
  const result = await requestWorker(text);
  const totalMs = Math.round(performance.now() - startedAt);
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, encodePcm16Wav(result.audio, result.done.sampleRate || SAMPLE_RATE));
  console.log('[tts:smoke] Done', {
    audioSeconds: Number(result.done.audioSeconds.toFixed(2)),
    firstChunkMs: result.firstChunkMs,
    output: OUTPUT_PATH,
    sampleRate: result.done.sampleRate,
    totalMs,
  });
}

main().catch((error: unknown) => {
  console.error('[tts:smoke] Failed', error);
  process.exitCode = 1;
});
