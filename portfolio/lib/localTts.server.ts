import 'server-only';

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const PROVIDER = 'kitten-tts';
const MODEL_ID = process.env.LOCAL_TTS_MODEL_ID ?? 'KittenML/kitten-tts-nano-0.1';
const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.cache', 'portfolio', 'kitten-tts');
const WORKER_RELATIVE_PATH = path.join('scripts', 'kitten-tts-worker.py');
const SAMPLE_RATE = 24_000;
const DEFAULT_CHUNK_CHARS = 120;
const MAX_CHUNK_CHARS = 320;
const MAX_TEXT_CHARS = 1_200;
const DEFAULT_SPEED = 1.08;
const MIN_SPEED = 0.85;
const MAX_SPEED = 1.15;
const DEFAULT_VOICE = 'expr-voice-5-m';

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

export type LocalTtsVoice = (typeof ALLOWED_VOICES)[number];

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

type WorkerResponseMessage = WorkerResultMessage | WorkerErrorMessage;

interface PendingWorkerRequest {
  completeWorkerExecution: () => void;
  reject: (error: Error) => void;
  resolve: (result: WorkerResultMessage) => void;
}

export interface LocalTtsOptions {
  speed: number;
  voice: LocalTtsVoice;
}

export interface LocalTtsChunk {
  audio: Float32Array;
  durationMs: number;
  index: number;
  sampleRate: number;
  text: string;
}

export interface LocalTtsSettings {
  cacheDir: string;
  chunkChars: number;
  concurrency: number;
  espeakLibrary: string | null;
  interOpThreads: number;
  intraOpThreads: number;
  maxQueue: number;
  maxTextChars: number;
  modelId: string;
  modelPath: string | null;
  provider: 'kitten-tts';
  pythonExecutable: string;
  sampleRate: number;
  speed: number;
  voice: LocalTtsVoice;
  voicesPath: string | null;
  workerScript: string;
}

export interface PublicLocalTtsSettings {
  cacheMode: 'cache-first' | 'offline';
  chunkChars: number;
  concurrency: number;
  defaultSpeed: number;
  defaultVoice: LocalTtsVoice;
  maxQueue: number;
  maxTextChars: number;
  modelId: string;
  provider: 'kitten-tts';
  sampleRate: number;
}

class TtsQueueFullError extends Error {
  constructor() {
    super('Local TTS queue is full. Try again in a moment.');
    this.name = 'TtsQueueFullError';
  }
}

class TtsRequestAbortedError extends Error {
  readonly workerCompletion: Promise<void>;

  constructor(workerCompletion = Promise.resolve()) {
    super('Local TTS request was cancelled.');
    this.name = 'TtsRequestAbortedError';
    this.workerCompletion = workerCompletion;
  }
}

class TtsWorkerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TtsWorkerUnavailableError';
  }
}

export function isTtsQueueFullError(error: unknown): error is TtsQueueFullError {
  return error instanceof TtsQueueFullError;
}

export function isTtsRequestAbortedError(error: unknown): error is TtsRequestAbortedError {
  return error instanceof TtsRequestAbortedError;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new TtsRequestAbortedError();
  }
}

function getEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getEnvFloat(names: readonly string[], fallback: number, min: number, max: number): number {
  const raw = names.map(name => process.env[name]).find(Boolean);
  if (!raw) return fallback;

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getConfiguredVoice(): LocalTtsVoice {
  const raw = process.env.LOCAL_TTS_VOICE ?? process.env.NEXT_PUBLIC_TTS_VOICE;
  return raw && (ALLOWED_VOICES as readonly string[]).includes(raw)
    ? raw as LocalTtsVoice
    : DEFAULT_VOICE;
}

function getConfiguredSpeed(): number {
  return getEnvFloat(['LOCAL_TTS_SPEED', 'NEXT_PUBLIC_TTS_SPEED'], DEFAULT_SPEED, MIN_SPEED, MAX_SPEED);
}

function getCpuCount(): number {
  return Math.max(1, os.availableParallelism?.() ?? os.cpus().length ?? 1);
}

function getDefaultIntraOpThreads(): number {
  return 1;
}

function getDefaultPythonExecutable(): string {
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

function getPythonExecutable(): string {
  return process.env.LOCAL_TTS_PYTHON?.trim() || getDefaultPythonExecutable();
}

function resolveWorkerScript(): string {
  const serverDir = process.argv[1] ? path.dirname(process.argv[1]) : process.cwd();
  const candidates = [
    path.join(process.cwd(), WORKER_RELATIVE_PATH),
    path.join(process.cwd(), '.next', 'standalone', WORKER_RELATIVE_PATH),
    path.join(serverDir, WORKER_RELATIVE_PATH),
  ];

  return candidates.find(candidate => existsSync(candidate)) ?? candidates[0];
}

function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return DEFAULT_SPEED;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

function getSettings(): LocalTtsSettings {
  const cpuCount = getCpuCount();
  const intraOpThreads = getEnvInt('LOCAL_TTS_INTRA_OP_THREADS', getDefaultIntraOpThreads(), 1, cpuCount);
  const speed = getConfiguredSpeed();
  const voice = getConfiguredVoice();

  return {
    cacheDir: process.env.LOCAL_TTS_CACHE_DIR ?? DEFAULT_CACHE_DIR,
    chunkChars: getEnvInt('LOCAL_TTS_CHUNK_CHARS', DEFAULT_CHUNK_CHARS, 80, MAX_CHUNK_CHARS),
    concurrency: getEnvInt('LOCAL_TTS_CONCURRENCY', 1, 1, 2),
    espeakLibrary: process.env.LOCAL_TTS_ESPEAK_LIBRARY ?? null,
    interOpThreads: getEnvInt('LOCAL_TTS_INTER_OP_THREADS', 1, 1, 2),
    intraOpThreads,
    maxQueue: getEnvInt('LOCAL_TTS_MAX_QUEUE', 4, 0, 16),
    maxTextChars: getEnvInt('LOCAL_TTS_MAX_TEXT_CHARS', MAX_TEXT_CHARS, 80, 4_000),
    modelId: MODEL_ID,
    modelPath: process.env.LOCAL_TTS_MODEL_PATH ?? process.env.KITTEN_TTS_MODEL_PATH ?? null,
    provider: PROVIDER,
    pythonExecutable: getPythonExecutable(),
    sampleRate: SAMPLE_RATE,
    speed,
    voice,
    voicesPath: process.env.LOCAL_TTS_VOICES_PATH ?? null,
    workerScript: resolveWorkerScript(),
  };
}

export function getLocalTtsSettings(): LocalTtsSettings {
  return getSettings();
}

function getLocalTtsCacheMode(): PublicLocalTtsSettings['cacheMode'] {
  return process.env.LOCAL_TTS_OFFLINE === '1' || process.env.HF_HUB_OFFLINE === '1'
    ? 'offline'
    : 'cache-first';
}

export function getPublicLocalTtsSettings(): PublicLocalTtsSettings {
  return {
    cacheMode: getLocalTtsCacheMode(),
    chunkChars: getEnvInt('LOCAL_TTS_CHUNK_CHARS', DEFAULT_CHUNK_CHARS, 80, MAX_CHUNK_CHARS),
    concurrency: getEnvInt('LOCAL_TTS_CONCURRENCY', 1, 1, 2),
    defaultSpeed: getConfiguredSpeed(),
    defaultVoice: getConfiguredVoice(),
    maxQueue: getEnvInt('LOCAL_TTS_MAX_QUEUE', 4, 0, 16),
    maxTextChars: getEnvInt('LOCAL_TTS_MAX_TEXT_CHARS', MAX_TEXT_CHARS, 80, 4_000),
    modelId: MODEL_ID,
    provider: PROVIDER,
    sampleRate: SAMPLE_RATE,
  };
}

function configureCpuRuntime(settings: LocalTtsSettings): void {
  const intraOpThreads = String(settings.intraOpThreads);
  process.env.OMP_NUM_THREADS ??= intraOpThreads;
  process.env.ONNX_NUM_THREADS ??= intraOpThreads;
  process.env.OPENBLAS_NUM_THREADS ??= '1';
  process.env.MKL_NUM_THREADS ??= '1';
  process.env.VECLIB_MAXIMUM_THREADS ??= '1';
  process.env.NUMEXPR_NUM_THREADS ??= '1';
  process.env.OMP_WAIT_POLICY ??= 'PASSIVE';
  process.env.UV_THREADPOOL_SIZE ??= String(Math.max(4, settings.intraOpThreads));
}

function createWorkerEnv(settings: LocalTtsSettings): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HF_HOME: process.env.HF_HOME ?? settings.cacheDir,
    HF_HUB_DISABLE_SYMLINKS_WARNING: process.env.HF_HUB_DISABLE_SYMLINKS_WARNING ?? '1',
    KITTEN_TTS_MODEL: process.env.KITTEN_TTS_MODEL ?? settings.modelId,
    LOCAL_TTS_CACHE_DIR: settings.cacheDir,
    LOCAL_TTS_ESPEAK_LIBRARY: settings.espeakLibrary ?? process.env.LOCAL_TTS_ESPEAK_LIBRARY,
    LOCAL_TTS_INTER_OP_THREADS: String(settings.interOpThreads),
    LOCAL_TTS_INTRA_OP_THREADS: String(settings.intraOpThreads),
    LOCAL_TTS_MODEL_ID: settings.modelId,
    LOCAL_TTS_MODEL_PATH: settings.modelPath ?? process.env.LOCAL_TTS_MODEL_PATH,
    LOCAL_TTS_VOICES_PATH: settings.voicesPath ?? process.env.LOCAL_TTS_VOICES_PATH,
    OMP_NUM_THREADS: process.env.OMP_NUM_THREADS ?? String(settings.intraOpThreads),
    ONNX_NUM_THREADS: process.env.ONNX_NUM_THREADS ?? String(settings.intraOpThreads),
    OPENBLAS_NUM_THREADS: process.env.OPENBLAS_NUM_THREADS ?? '1',
    MKL_NUM_THREADS: process.env.MKL_NUM_THREADS ?? '1',
    VECLIB_MAXIMUM_THREADS: process.env.VECLIB_MAXIMUM_THREADS ?? '1',
    NUMEXPR_NUM_THREADS: process.env.NUMEXPR_NUM_THREADS ?? '1',
    OMP_WAIT_POLICY: process.env.OMP_WAIT_POLICY ?? 'PASSIVE',
  };
}

class KittenTtsWorkerClient {
  private child: ChildProcessWithoutNullStreams;
  private closed = false;
  private nextRequestId = 0;
  private pending = new Map<string, PendingWorkerRequest>();

  constructor(settings: LocalTtsSettings) {
    this.child = spawn(settings.pythonExecutable, ['-u', settings.workerScript], {
      cwd: process.cwd(),
      env: createWorkerEnv(settings),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stdout = readline.createInterface({ input: this.child.stdout });
    stdout.on('line', line => this.handleStdoutLine(line));
    this.child.stderr.on('data', chunk => {
      const message = String(chunk).trim();
      if (message) console.warn('[local-tts:worker]', message);
    });
    this.child.on('error', error => this.handleExit(error));
    this.child.on('exit', (code, signal) => {
      const detail = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`;
      this.handleExit(new TtsWorkerUnavailableError(`Local TTS worker exited with ${detail}.`));
    });
  }

  async synthesize(text: string, options: LocalTtsOptions, signal?: AbortSignal): Promise<WorkerResultMessage> {
    const message = await this.sendRequest({ text, type: 'synthesize', voice: options.voice, speed: options.speed }, signal);
    return message;
  }

  private handleStdoutLine(line: string): void {
    if (!line.trim()) return;

    let message: WorkerResponseMessage;
    try {
      message = JSON.parse(line) as WorkerResponseMessage;
    } catch {
      this.handleExit(new TtsWorkerUnavailableError('Local TTS worker emitted invalid JSON.'));
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    pending.completeWorkerExecution();

    if (message.type === 'error') {
      pending.reject(new TtsWorkerUnavailableError(message.message ?? 'Local TTS worker failed.'));
      return;
    }

    pending.resolve(message);
  }

  private handleExit(error: Error): void {
    if (this.closed) return;
    this.closed = true;

    try {
      if (!this.child.killed) this.child.kill();
    } catch {
      // The process may already be gone by the time an exit/error path races in.
    }

    for (const pending of this.pending.values()) {
      pending.completeWorkerExecution();
      pending.reject(error);
    }
    this.pending.clear();

    if (activeWorker === this) {
      activeWorker = null;
      workerPromise = null;
    }
  }

  private sendRequest(
    request: { speed: number; text: string; type: 'synthesize'; voice: LocalTtsVoice },
    signal?: AbortSignal,
  ): Promise<WorkerResultMessage> {
    if (this.closed) {
      return Promise.reject(new TtsWorkerUnavailableError('Local TTS worker is not running.'));
    }

    throwIfAborted(signal);
    const id = String(++this.nextRequestId);
    let completeWorkerExecution: () => void = () => undefined;
    const workerCompletion = new Promise<void>((resolve) => {
      completeWorkerExecution = resolve;
    });
    let submitted = false;

    return new Promise<WorkerResultMessage>((resolve, reject) => {
      const abortRequest = () => {
        const pending = this.pending.get(id);
        if (!pending) return;
        pending.reject(new TtsRequestAbortedError(workerCompletion));
        if (!submitted) {
          this.pending.delete(id);
          pending.completeWorkerExecution();
        }
      };
      const cleanup = () => signal?.removeEventListener('abort', abortRequest);

      this.pending.set(id, {
        completeWorkerExecution,
        reject: (error) => {
          cleanup();
          reject(error);
        },
        resolve: (result) => {
          cleanup();
          resolve(result);
        },
      });

      signal?.addEventListener('abort', abortRequest, { once: true });
      if (signal?.aborted) {
        abortRequest();
        return;
      }

      const payload = `${JSON.stringify({ id, ...request })}\n`;
      submitted = true;
      this.child.stdin.write(payload, (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        pending.completeWorkerExecution();
        pending.reject(new TtsWorkerUnavailableError(`Local TTS worker stdin failed: ${error.message}`));
      });
    });
  }
}

let workerPromise: Promise<KittenTtsWorkerClient> | null = null;
let activeWorker: KittenTtsWorkerClient | null = null;
let activeJobs = 0;
let queuedJobs = 0;
const waiters: Array<() => void> = [];

async function loadLocalTts(): Promise<KittenTtsWorkerClient> {
  if (workerPromise) return workerPromise;

  workerPromise = (async () => {
    const settings = getSettings();
    configureCpuRuntime(settings);
    await mkdir(settings.cacheDir, { recursive: true });
    const worker = new KittenTtsWorkerClient(settings);
    activeWorker = worker;
    return worker;
  })().catch((error: unknown) => {
    workerPromise = null;
    throw error;
  });

  return workerPromise;
}

function releaseTtsSlot(): void {
  const next = waiters.shift();
  if (next) {
    next();
    return;
  }
  activeJobs = Math.max(0, activeJobs - 1);
}

export function getLocalTtsQueueState(): { active: number; queued: number } {
  return { active: activeJobs, queued: queuedJobs };
}

export async function runWithLocalTtsSlot<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const settings = getSettings();
  throwIfAborted(signal);
  let hasSlot = false;

  if (activeJobs >= settings.concurrency) {
    if (queuedJobs >= settings.maxQueue) {
      throw new TtsQueueFullError();
    }

    queuedJobs += 1;
    try {
      await new Promise<void>((resolve, reject) => {
        const waiter = () => {
          signal?.removeEventListener('abort', abortWaiter);
          hasSlot = true;
          resolve();
        };
        const abortWaiter = () => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new TtsRequestAbortedError());
        };

        waiters.push(waiter);
        signal?.addEventListener('abort', abortWaiter, { once: true });
      });
    } finally {
      queuedJobs = Math.max(0, queuedJobs - 1);
    }
  } else {
    activeJobs += 1;
    hasSlot = true;
  }

  try {
    throwIfAborted(signal);
  } catch (error) {
    if (hasSlot) releaseTtsSlot();
    throw error;
  }
  let taskPromise: Promise<T>;
  try {
    taskPromise = task();
  } catch (error) {
    releaseTtsSlot();
    throw error;
  }

  return taskPromise.then(
    result => {
      releaseTtsSlot();
      return result;
    },
    (error: unknown) => {
      if (isTtsRequestAbortedError(error)) {
        void error.workerCompletion.then(releaseTtsSlot);
      } else {
        releaseTtsSlot();
      }
      throw error;
    },
  );
}

function normalizeText(text: string, maxChars: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

function splitLongSegment(segment: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let remaining = segment.trim();

  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars + 1);
    const breakAt = Math.max(
      window.lastIndexOf(', '),
      window.lastIndexOf('; '),
      window.lastIndexOf(': '),
      window.lastIndexOf(' '),
    );
    const cutAt = breakAt > 80 ? breakAt + 1 : maxChars;
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export function splitTextForLocalTts(text: string): string[] {
  const settings = getSettings();
  const normalized = normalizeText(text, settings.maxTextChars);
  if (!normalized) return [];

  const sentenceMatches = normalized.match(/[^.!?]+[.!?]+["')\]]?|[^.!?]+$/g) ?? [normalized];
  const chunks: string[] = [];
  let pending = '';

  for (const rawSentence of sentenceMatches) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    if (sentence.length > settings.chunkChars) {
      if (pending) {
        chunks.push(pending);
        pending = '';
      }
      chunks.push(...splitLongSegment(sentence, settings.chunkChars));
      continue;
    }

    const candidate = pending ? `${pending} ${sentence}` : sentence;
    if (candidate.length <= settings.chunkChars) {
      pending = candidate;
    } else {
      if (pending) chunks.push(pending);
      pending = sentence;
    }
  }

  if (pending) chunks.push(pending);
  return chunks;
}

export function resolveLocalTtsOptions(input: { speed?: unknown; voice?: unknown }): LocalTtsOptions {
  const settings = getSettings();
  const voice = typeof input.voice === 'string' && (ALLOWED_VOICES as readonly string[]).includes(input.voice)
    ? input.voice as LocalTtsVoice
    : settings.voice;
  const speed = typeof input.speed === 'number' ? clampSpeed(input.speed) : settings.speed;

  return { speed, voice };
}

function decodeFloat32Base64(audioBase64: string): Float32Array {
  const buffer = Buffer.from(audioBase64, 'base64');
  const sampleCount = Math.floor(buffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
  const view = new Float32Array(buffer.buffer, buffer.byteOffset, sampleCount);
  return new Float32Array(view);
}

function applyLinearSpeedTransform(samples: Float32Array, speed: number): Float32Array {
  const clampedSpeed = clampSpeed(speed);
  if (samples.length === 0 || Math.abs(clampedSpeed - DEFAULT_SPEED) < 0.001) {
    return samples;
  }

  const outputLength = Math.max(1, Math.round(samples.length / clampedSpeed));
  const output = new Float32Array(outputLength);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourcePosition = outputIndex * clampedSpeed;
    const lowerIndex = Math.floor(sourcePosition);
    const upperIndex = Math.min(samples.length - 1, lowerIndex + 1);
    const fraction = sourcePosition - lowerIndex;
    const lower = samples[Math.min(samples.length - 1, lowerIndex)];
    const upper = samples[upperIndex];
    output[outputIndex] = lower + ((upper - lower) * fraction);
  }

  return output;
}

function normalizeWorkerAudio(result: WorkerResultMessage, speed: number): { audio: Float32Array; sampleRate: number } {
  const decoded = decodeFloat32Base64(result.audioBase64);
  const sampleRate = result.sampleRate || SAMPLE_RATE;
  const audio = result.speedApplied === false ? applyLinearSpeedTransform(decoded, speed) : decoded;
  return { audio, sampleRate };
}

function concatFloat32(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

export function encodePcm16(samples: Float32Array): Buffer {
  const buffer = Buffer.allocUnsafe(samples.length * 2);

  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const clipped = Math.max(-1, Math.min(1, samples[sampleIndex]));
    const scaled = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
    buffer.writeInt16LE(Math.round(scaled), sampleIndex * 2);
  }

  return buffer;
}

export function encodePcm16Wav(samples: Float32Array, sampleRate = SAMPLE_RATE): Buffer {
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

export async function synthesizeLocalTts(text: string, options: LocalTtsOptions, signal?: AbortSignal): Promise<Buffer> {
  const chunks = splitTextForLocalTts(text);
  if (chunks.length === 0) {
    return encodePcm16Wav(new Float32Array(), SAMPLE_RATE);
  }

  throwIfAborted(signal);
  const worker = await loadLocalTts();
  const audioChunks: Float32Array[] = [];

  for (const chunk of chunks) {
    throwIfAborted(signal);
    const result = await worker.synthesize(chunk, options, signal);
    throwIfAborted(signal);
    audioChunks.push(normalizeWorkerAudio(result, options.speed).audio);
  }

  return encodePcm16Wav(concatFloat32(audioChunks), SAMPLE_RATE);
}

export async function* streamLocalTts(text: string, options: LocalTtsOptions, signal?: AbortSignal): AsyncGenerator<LocalTtsChunk> {
  const chunks = splitTextForLocalTts(text);
  throwIfAborted(signal);
  const worker = await loadLocalTts();

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    throwIfAborted(signal);
    const startedAt = performance.now();
    const result = await worker.synthesize(chunks[chunkIndex], options, signal);
    const audio = normalizeWorkerAudio(result, options.speed);
    throwIfAborted(signal);
    yield {
      audio: audio.audio,
      durationMs: Math.round(performance.now() - startedAt),
      index: chunkIndex,
      sampleRate: audio.sampleRate,
      text: chunks[chunkIndex],
    };
  }
}
