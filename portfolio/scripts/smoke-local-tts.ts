import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { performance } from 'node:perf_hooks';

import { adaptTextForSpeech } from '../lib/ttsPrompts';

const MODEL_ID = process.env.LOCAL_TTS_MODEL_ID ?? 'KittenML/kitten-tts-nano-0.1';
const DEFAULT_TEXT = 'Hello from local KittenTTS. The Python worker is loaded and speaking.';
const DEFAULT_SPEED = 1;
const DEFAULT_VOICE = 'expr-voice-5-m';
const MIN_SPEED = 0.85;
const MAX_SPEED = 1.15;
const OUTPUT_PATH = process.env.LOCAL_TTS_OUTPUT ?? path.join('tmp', 'local-tts-smoke.wav');
const SAMPLE_RATE = 24_000;

const ALLOWED_VOICES = [
  'expr-voice-2-m',
  'expr-voice-2-f',
  'expr-voice-3-m',
  'expr-voice-3-f',
  'expr-voice-4-m',
  'expr-voice-4-f',
  'expr-voice-5-m',
  'expr-voice-5-f',
] as const;

type KittenVoice = (typeof ALLOWED_VOICES)[number];

interface WorkerResultMessage {
  audioBase64: string;
  audioSeconds?: number;
  durationMs?: number;
  id: string;
  sampleRate: number;
  speedApplied?: boolean;
  type: 'result';
}

interface WorkerErrorMessage {
  id: string;
  message?: string;
  type: 'error';
}

type WorkerMessage = WorkerResultMessage | WorkerErrorMessage;

function pick<const T extends readonly string[]>(value: string | undefined, allowed: T, fallback: T[number]): T[number] {
  if (value && (allowed as readonly string[]).includes(value)) {
    return value as T[number];
  }

  return fallback;
}

function getEnvSpeed(): number {
  const raw = process.env.LOCAL_TTS_SPEED ?? process.env.NEXT_PUBLIC_TTS_SPEED;
  if (!raw) return DEFAULT_SPEED;

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_SPEED;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, parsed));
}

function getPythonExecutable(): string {
  if (process.env.LOCAL_TTS_PYTHON?.trim()) {
    return process.env.LOCAL_TTS_PYTHON.trim();
  }

  const venvPython = process.platform === 'win32'
    ? path.join('Scripts', 'python.exe')
    : path.join('bin', 'python');
  const candidates = [
    path.join(process.cwd(), '.venv', venvPython),
    path.join(process.cwd(), '..', '.venv', venvPython),
  ];
  const workspacePython = candidates.find(candidate => existsSync(candidate));
  if (workspacePython) return workspacePython;

  return process.platform === 'win32' ? 'python' : 'python3';
}

function configureCpuDefaults(): void {
  const threads = process.env.LOCAL_TTS_INTRA_OP_THREADS ?? '1';
  process.env.OMP_NUM_THREADS ??= threads;
  process.env.ONNX_NUM_THREADS ??= threads;
  process.env.OMP_WAIT_POLICY ??= 'PASSIVE';
  process.env.OPENBLAS_NUM_THREADS ??= '1';
  process.env.MKL_NUM_THREADS ??= '1';
}

function resolveText(): string {
  const argvText = process.argv.slice(2).join(' ').trim();
  return argvText || process.env.LOCAL_TTS_TEXT || DEFAULT_TEXT;
}

function decodeFloat32Base64(audioBase64: string): Float32Array {
  const buffer = Buffer.from(audioBase64, 'base64');
  const sampleCount = Math.floor(buffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
  const view = new Float32Array(buffer.buffer, buffer.byteOffset, sampleCount);
  return new Float32Array(view);
}

function encodePcm16(samples: Float32Array): Buffer {
  const buffer = Buffer.allocUnsafe(samples.length * 2);

  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const clipped = Math.max(-1, Math.min(1, samples[sampleIndex]));
    const scaled = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
    buffer.writeInt16LE(Math.round(scaled), sampleIndex * 2);
  }

  return buffer;
}

function encodePcm16Wav(samples: Float32Array, sampleRate: number): Buffer {
  const pcm = encodePcm16(samples);
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

async function requestWorker(text: string, voice: KittenVoice, speed: number): Promise<WorkerResultMessage> {
  const workerScript = path.join(process.cwd(), 'scripts', 'kitten-tts-worker.py');
  const worker = spawn(getPythonExecutable(), ['-u', workerScript], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HF_HUB_DISABLE_SYMLINKS_WARNING: process.env.HF_HUB_DISABLE_SYMLINKS_WARNING ?? '1',
      KITTEN_TTS_MODEL: process.env.KITTEN_TTS_MODEL ?? MODEL_ID,
      LOCAL_TTS_MODEL_ID: MODEL_ID,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  worker.stderr.on('data', chunk => {
    const message = String(chunk).trim();
    if (message) console.warn('[tts:smoke:worker]', message);
  });

  const lines = readline.createInterface({ input: worker.stdout });
  const resultPromise = new Promise<WorkerResultMessage>((resolve, reject) => {
    worker.once('error', reject);
    worker.once('exit', (code, signal) => {
      reject(new Error(`KittenTTS worker exited before result (${signal ?? code ?? 'unknown'}).`));
    });
    lines.on('line', (line) => {
      const message = JSON.parse(line) as WorkerMessage;
      if (message.type === 'error') {
        reject(new Error(message.message ?? 'KittenTTS worker failed.'));
        return;
      }
      resolve(message);
    });
  });

  worker.stdin.write(`${JSON.stringify({ id: 'smoke', type: 'synthesize', text, voice, speed })}\n`);
  worker.stdin.end();

  return await resultPromise;
}

async function main(): Promise<void> {
  configureCpuDefaults();

  const voice = pick(process.env.LOCAL_TTS_VOICE, ALLOWED_VOICES, DEFAULT_VOICE) as KittenVoice;
  const speed = getEnvSpeed();
  const visualText = resolveText();
  const text = adaptTextForSpeech(visualText);

  console.log('[tts:smoke] Loading KittenTTS worker...', { model: MODEL_ID, speed, voice });
  const startedAt = performance.now();
  const result = await requestWorker(text, voice, speed);
  const totalMs = Math.round(performance.now() - startedAt);
  const audio = decodeFloat32Base64(result.audioBase64);
  const sampleRate = result.sampleRate || SAMPLE_RATE;
  const wav = encodePcm16Wav(audio, sampleRate);

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, wav);

  console.log('[tts:smoke] Done', {
    audioSeconds: Number((result.audioSeconds ?? audio.length / sampleRate).toFixed(2)),
    generateMs: result.durationMs,
    output: OUTPUT_PATH,
    sampleRate,
    totalMs,
  });
}

main().catch((error: unknown) => {
  console.error('[tts:smoke] Failed', error);
  process.exitCode = 1;
});
