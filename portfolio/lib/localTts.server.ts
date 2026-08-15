import 'server-only';

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const PROVIDER = 'pocket-tts';
const MODEL_ID = 'kyutai/pocket-tts';
const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.cache', 'portfolio', 'pocket-tts');
const DEFAULT_REFERENCE_PATH = path.join('public', 'sounds', 'voice', 'TTSReference.mp3');
const WORKER_RELATIVE_PATH = path.join('scripts', 'pocket-tts-worker.py');
const SAMPLE_RATE = 24_000;
const MAX_TEXT_CHARS = 1_200;
const DEFAULT_SPEED = 1;
const MIN_SPEED = 0.85;
const MAX_SPEED = 1.15;
const DEFAULT_VOICE = 'custom-dhruv';
const UTTERANCE_CACHE_VERSION = 'v8';
const UTTERANCE_CACHE_CODEC = 'pcm_s16le';
const UTTERANCE_CACHE_SUBDIR = 'utterances';
const MAX_UTTERANCE_CACHE_FILES = 64;
const MAX_UTTERANCE_CACHE_BYTES = 64 * 1024 * 1024;

export type LocalTtsVoice = typeof DEFAULT_VOICE;

interface WorkerChunkMessage {
  audioBase64: string;
  id: string;
  index: number;
  sampleRate: number;
  type: 'chunk';
  voiceRevision: string;
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

type WorkerResponseMessage = WorkerChunkMessage | WorkerDoneMessage | WorkerErrorMessage;

const MAX_WORKER_SAMPLE_RATE = 192_000;

interface PendingWorkerRequest {
  completeWorkerExecution: () => void;
  error: Error | null;
  chunks: WorkerChunkMessage[];
  done: boolean;
  aborted: TtsRequestAbortedError | null;
  waiters: Array<{ reject: (error: Error) => void; resolve: (chunk: WorkerChunkMessage | null) => void }>;
}

export interface LocalTtsOptions {
  speed: number;
  voice: LocalTtsVoice;
}

export interface LocalTtsChunk {
  audio: Buffer;
  durationMs: number;
  index: number;
  sampleRate: number;
  text: string;
  voiceRevision: string;
}

export interface LocalTtsSettings {
  cacheDir: string;
  chunkChars: number;
  concurrency: number;
  interOpThreads: number;
  intraOpThreads: number;
  maxQueue: number;
  maxTextChars: number;
  modelId: string;
  modelPath: string | null;
  provider: 'pocket-tts';
  pythonExecutable: string;
  referencePath: string;
  sampleRate: number;
  speed: number;
  voice: LocalTtsVoice;
  workerScript: string;
}

export interface PublicLocalTtsSettings {
  cacheMode: 'cache-first' | 'offline';
  concurrency: number;
  defaultSpeed: number;
  defaultVoice: LocalTtsVoice;
  maxQueue: number;
  maxTextChars: number;
  modelId: string;
  provider: 'pocket-tts';
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

function getConfiguredVoice(): LocalTtsVoice { return DEFAULT_VOICE; }

function getConfiguredSpeed(): number {
  return getEnvFloat(['LOCAL_TTS_SPEED'], DEFAULT_SPEED, MIN_SPEED, MAX_SPEED);
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

function getReferencePath(): string {
  const configuredPath = process.env.LOCAL_TTS_REFERENCE_PATH?.trim() || DEFAULT_REFERENCE_PATH;
  return path.resolve(process.cwd(), configuredPath);
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

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNonNegativeFiniteNumber(value) && Number.isInteger(value);
}

function isValidSampleRate(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value > 0
    && value <= MAX_WORKER_SAMPLE_RATE;
}

function isValidBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function getSettings(): LocalTtsSettings {
  const cpuCount = getCpuCount();
  const intraOpThreads = getEnvInt('LOCAL_TTS_INTRA_OP_THREADS', getDefaultIntraOpThreads(), 1, cpuCount);
  const speed = getConfiguredSpeed();
  const voice = getConfiguredVoice();

  return {
    cacheDir: process.env.LOCAL_TTS_CACHE_DIR ?? DEFAULT_CACHE_DIR,
    chunkChars: MAX_TEXT_CHARS,
    concurrency: 1,
    interOpThreads: getEnvInt('LOCAL_TTS_INTER_OP_THREADS', 1, 1, 2),
    intraOpThreads,
    maxQueue: getEnvInt('LOCAL_TTS_MAX_QUEUE', 4, 0, 16),
    maxTextChars: getEnvInt('LOCAL_TTS_MAX_TEXT_CHARS', MAX_TEXT_CHARS, 80, 4_000),
    modelId: MODEL_ID,
    modelPath: null,
    provider: PROVIDER,
    pythonExecutable: getPythonExecutable(),
    referencePath: getReferencePath(),
    sampleRate: SAMPLE_RATE,
    speed,
    voice,
    workerScript: resolveWorkerScript(),
  };
}

export function getLocalTtsSettings(): LocalTtsSettings {
  return getSettings();
}

export async function getLocalTtsVoiceRevision(): Promise<string> {
  const referenceAudio = await readFile(getSettings().referencePath);
  return createHash('sha256').update(referenceAudio).digest('hex');
}

function getLocalTtsCacheMode(): PublicLocalTtsSettings['cacheMode'] {
  return process.env.LOCAL_TTS_OFFLINE === '1' || process.env.HF_HUB_OFFLINE === '1'
    ? 'offline'
    : 'cache-first';
}

export function getPublicLocalTtsSettings(): PublicLocalTtsSettings {
  return {
    cacheMode: getLocalTtsCacheMode(),
    concurrency: 1,
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

export function createWorkerEnv(settings: LocalTtsSettings): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    HF_HUB_CACHE: process.env.HF_HUB_CACHE ?? settings.cacheDir,
    HF_HUB_DISABLE_SYMLINKS_WARNING: process.env.HF_HUB_DISABLE_SYMLINKS_WARNING ?? '1',
    LOCAL_TTS_CACHE_DIR: settings.cacheDir,
    LOCAL_TTS_INTER_OP_THREADS: String(settings.interOpThreads),
    LOCAL_TTS_INTRA_OP_THREADS: String(settings.intraOpThreads),
    LOCAL_TTS_MODEL_ID: settings.modelId,
    LOCAL_TTS_REFERENCE_PATH: settings.referencePath,
    OMP_NUM_THREADS: process.env.OMP_NUM_THREADS ?? String(settings.intraOpThreads),
    ONNX_NUM_THREADS: process.env.ONNX_NUM_THREADS ?? String(settings.intraOpThreads),
    OPENBLAS_NUM_THREADS: process.env.OPENBLAS_NUM_THREADS ?? '1',
    MKL_NUM_THREADS: process.env.MKL_NUM_THREADS ?? '1',
    VECLIB_MAXIMUM_THREADS: process.env.VECLIB_MAXIMUM_THREADS ?? '1',
    NUMEXPR_NUM_THREADS: process.env.NUMEXPR_NUM_THREADS ?? '1',
    OMP_WAIT_POLICY: process.env.OMP_WAIT_POLICY ?? 'PASSIVE',
  };

    environment.HF_HUB_OFFLINE = process.env.LOCAL_TTS_OFFLINE === '1'
      ? '1'
      : process.env.HF_HUB_OFFLINE;

  return environment;
}

class PocketTtsWorkerClient {
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

  async *synthesize(text: string, options: LocalTtsOptions, signal?: AbortSignal): AsyncGenerator<WorkerChunkMessage> {
    const pending = await this.sendRequest({ text, type: 'synthesize', voice: options.voice, speed: options.speed }, signal);
    while (true) {
      const chunk = await this.nextChunk(pending);
      if (!chunk) return;
      yield chunk;
    }
  }

  private handleStdoutLine(line: string): void {
    if (!line.trim()) return;

    let payload: unknown;
    try {
      payload = JSON.parse(line) as unknown;
    } catch {
      this.handleExit(new TtsWorkerUnavailableError('Local TTS worker emitted invalid JSON.'));
      return;
    }

    const message = this.parseWorkerMessage(payload);
    if (!message) {
      const id = this.getWorkerMessageId(payload);
      if (id && this.pending.has(id)) {
        this.failPendingRequest(id, 'Local TTS worker emitted an invalid response.');
      } else {
        this.handleExit(new TtsWorkerUnavailableError('Local TTS worker emitted an invalid response.'));
      }
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) return;
    if (message.type === 'chunk') {
      if (pending.aborted) return;
      const waiter = pending.waiters.shift();
      if (waiter) waiter.resolve(message);
      else pending.chunks.push(message);
      return;
    }

    this.pending.delete(message.id);
    pending.done = true;
    if (message.type === 'error') {
      pending.error = new TtsWorkerUnavailableError(message.message ?? 'Local TTS worker failed.');
    }
    pending.completeWorkerExecution();
    this.flushPending(pending);
  }

  private getWorkerMessageId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const id = (payload as { id?: unknown }).id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  }

  private parseWorkerMessage(payload: unknown): WorkerResponseMessage | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const message = payload as Record<string, unknown>;
    const { id, type } = message;
    if (typeof id !== 'string' || id.length === 0 || typeof type !== 'string') return null;

    if (type === 'chunk') {
      const { audioBase64, index, sampleRate, voiceRevision } = message;
      if (
        typeof audioBase64 !== 'string'
        || !isValidBase64(audioBase64)
        || !isNonNegativeInteger(index)
        || !isValidSampleRate(sampleRate)
        || typeof voiceRevision !== 'string'
        || !/^[a-f0-9]{64}$/.test(voiceRevision)
      ) {
        return null;
      }
      return { audioBase64, id, index, sampleRate, type, voiceRevision };
    }

    if (type === 'done') {
      const { audioSeconds, durationMs, sampleRate } = message;
      if (
        !isNonNegativeFiniteNumber(audioSeconds)
        || !isNonNegativeFiniteNumber(durationMs)
        || !isValidSampleRate(sampleRate)
      ) {
        return null;
      }
      return { audioSeconds, durationMs, id, sampleRate, type };
    }

    if (type === 'error') {
      const { message: errorMessage } = message;
      if (errorMessage !== undefined && typeof errorMessage !== 'string') return null;
      return { id, message: errorMessage, type };
    }

    return null;
  }

  private failPendingRequest(id: string, message: string): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    pending.done = true;
    pending.error = new TtsWorkerUnavailableError(message);
    pending.completeWorkerExecution();
    this.flushPending(pending);
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
      pending.error = error;
      pending.done = true;
      pending.completeWorkerExecution();
      this.flushPending(pending);
    }
    this.pending.clear();

    if (activeWorker === this) {
      activeWorker = null;
      workerPromise = null;
    }
  }

  private flushPending(pending: PendingWorkerRequest): void {
    while (pending.waiters.length > 0) {
      const waiter = pending.waiters.shift();
      if (!waiter) continue;
      if (pending.aborted) waiter.reject(pending.aborted);
      else if (pending.error) waiter.reject(pending.error);
      else waiter.resolve(pending.chunks.shift() ?? null);
    }
  }

  private nextChunk(pending: PendingWorkerRequest): Promise<WorkerChunkMessage | null> {
    if (pending.aborted) return Promise.reject(pending.aborted);
    if (pending.error) return Promise.reject(pending.error);
    const chunk = pending.chunks.shift();
    if (chunk) return Promise.resolve(chunk);
    if (pending.done) return Promise.resolve(null);
    return new Promise((resolve, reject) => pending.waiters.push({ resolve, reject }));
  }

  private sendRequest(
    request: { speed: number; text: string; type: 'synthesize'; voice: LocalTtsVoice },
    signal?: AbortSignal,
  ): Promise<PendingWorkerRequest> {
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

    return new Promise<PendingWorkerRequest>((resolve, reject) => {
      const abortRequest = () => {
        const pending = this.pending.get(id);
        if (!pending) return;
        pending.aborted ??= new TtsRequestAbortedError(workerCompletion);
        cleanup();
        reject(pending.aborted);
        this.flushPending(pending);
        if (!submitted) {
          this.pending.delete(id);
          pending.done = true;
          pending.completeWorkerExecution();
        }
      };
      const cleanup = () => signal?.removeEventListener('abort', abortRequest);

      this.pending.set(id, {
        aborted: null,
        chunks: [],
        completeWorkerExecution,
        done: false,
        error: null,
        waiters: [],
      });

      signal?.addEventListener('abort', abortRequest, { once: true });
      if (signal?.aborted) {
        abortRequest();
        return;
      }

      const payload = `${JSON.stringify({ id, ...request })}\n`;
      submitted = true;
      this.child.stdin.write(payload, (error) => {
        if (!error) {
          const pending = this.pending.get(id);
          if (pending) resolve(pending);
          return;
        }
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        pending.done = true;
        pending.error = new TtsWorkerUnavailableError(`Local TTS worker stdin failed: ${error.message}`);
        pending.completeWorkerExecution();
        this.flushPending(pending);
        cleanup();
        reject(pending.error);
      });
    });
  }
}

let workerPromise: Promise<PocketTtsWorkerClient> | null = null;
let activeWorker: PocketTtsWorkerClient | null = null;
let activeJobs = 0;
let queuedJobs = 0;
const waiters: Array<() => void> = [];

async function loadLocalTts(): Promise<PocketTtsWorkerClient> {
  if (workerPromise) return workerPromise;

  workerPromise = (async () => {
    const settings = getSettings();
    configureCpuRuntime(settings);
    await mkdir(settings.cacheDir, { recursive: true });
    const worker = new PocketTtsWorkerClient(settings);
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

export function splitTextForLocalTts(text: string): string[] {
  const settings = getSettings();
  const normalized = normalizeText(text, settings.maxTextChars);
  return normalized ? [normalized] : [];
}

export function resolveLocalTtsOptions(input: { speed?: unknown; voice?: unknown }): LocalTtsOptions {
  const settings = getSettings();
  const speed = typeof input.speed === 'number' ? clampSpeed(input.speed) : settings.speed;

  return { speed, voice: DEFAULT_VOICE };
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
  return encodePcm16BufferWav(encodePcm16(samples), sampleRate);
}

function encodePcm16BufferWav(pcm: Buffer, sampleRate = SAMPLE_RATE): Buffer {
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

function decodeWorkerPcm16(audioBase64: string): Buffer {
  const audio = Buffer.from(audioBase64, 'base64');
  if (audio.length % 2 !== 0) {
    throw new TtsWorkerUnavailableError('Local TTS worker emitted PCM data with an invalid byte length.');
  }
  return audio;
}

export async function synthesizeLocalTts(text: string, options: LocalTtsOptions, signal?: AbortSignal): Promise<Buffer> {
  const chunks = splitTextForLocalTts(text);
  if (chunks.length === 0) {
    return encodePcm16BufferWav(Buffer.alloc(0), SAMPLE_RATE);
  }

  throwIfAborted(signal);
  const worker = await loadLocalTts();
  const audioChunks: Buffer[] = [];
  for await (const chunk of worker.synthesize(chunks[0], options, signal)) {
    audioChunks.push(decodeWorkerPcm16(chunk.audioBase64));
  }

  return encodePcm16BufferWav(Buffer.concat(audioChunks), SAMPLE_RATE);
}

export async function* streamLocalTts(text: string, options: LocalTtsOptions, signal?: AbortSignal): AsyncGenerator<LocalTtsChunk> {
  const chunks = splitTextForLocalTts(text);
  throwIfAborted(signal);
  const worker = await loadLocalTts();

  for await (const chunk of worker.synthesize(chunks[0] ?? '', options, signal)) {
    throwIfAborted(signal);
    const audio = decodeWorkerPcm16(chunk.audioBase64);
    yield {
      audio,
      durationMs: Math.round(audio.length / 2 / chunk.sampleRate * 1000),
      index: chunk.index,
      sampleRate: chunk.sampleRate,
      text: chunks[0] ?? '',
      voiceRevision: chunk.voiceRevision,
    };
  }
}

export interface CachedUtterance {
  durationMs: number;
  pcm: Buffer;
  sampleRate: number;
  voiceRevision: string;
}

export interface TtsUtteranceCacheWriteMeta {
  durationMs: number;
  sampleRate: number;
  voiceRevision: string;
}

interface UtteranceCacheMeta extends TtsUtteranceCacheWriteMeta {
  byteLength: number;
  createdAt: number;
  key: string;
}

interface UtteranceCacheIndexEntry {
  byteLength: number;
  createdAt: number;
  digest: string;
  metaPath: string;
  pcmPath: string;
}

const pendingByKey = new Map<string, Promise<CachedUtterance>>();

function formatUtteranceCacheSpeed(speed: number): string {
  return String(Math.round(clampSpeed(speed) * 1000) / 1000);
}

function hashUtteranceCacheValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function getUtteranceCacheDir(): string {
  return path.join(getSettings().cacheDir, UTTERANCE_CACHE_SUBDIR);
}

function getUtteranceCachePaths(key: string): { digest: string; metaPath: string; pcmPath: string } {
  const digest = hashUtteranceCacheValue(key);
  const dir = getUtteranceCacheDir();
  return {
    digest,
    metaPath: path.join(dir, `${digest}.meta.json`),
    pcmPath: path.join(dir, `${digest}.pcm`),
  };
}

function parseUtteranceCacheMeta(raw: string): UtteranceCacheMeta | null {
  try {
    const value = JSON.parse(raw) as Partial<UtteranceCacheMeta>;
    if (
      typeof value.key !== 'string'
      || value.key.length === 0
      || !isValidSampleRate(value.sampleRate)
      || typeof value.voiceRevision !== 'string'
      || value.voiceRevision.length === 0
      || !isNonNegativeFiniteNumber(value.durationMs)
      || !isNonNegativeInteger(value.byteLength)
      || !isNonNegativeFiniteNumber(value.createdAt)
    ) {
      return null;
    }
    return {
      byteLength: value.byteLength,
      createdAt: value.createdAt,
      durationMs: value.durationMs,
      key: value.key,
      sampleRate: value.sampleRate,
      voiceRevision: value.voiceRevision,
    };
  } catch {
    return null;
  }
}

function getUtteranceCacheKeyParts(key: string): { sampleRate: number; voiceRevision: string } | null {
  const parts = key.split(':');
  if (parts.length !== 9) return null;
  const sampleRate = Number(parts[8]);
  if (!isValidSampleRate(sampleRate)) return null;
  return { sampleRate, voiceRevision: parts[5] ?? '' };
}

export function buildTtsUtteranceCacheKey(
  text: string,
  options: LocalTtsOptions,
  voiceRevision: string,
): string {
  const spokenText = normalizeText(text, getSettings().maxTextChars);
  const textHash = hashUtteranceCacheValue(spokenText);
  return [
    'tts',
    UTTERANCE_CACHE_VERSION,
    PROVIDER,
    textHash,
    options.voice,
    voiceRevision,
    formatUtteranceCacheSpeed(options.speed),
    UTTERANCE_CACHE_CODEC,
    String(SAMPLE_RATE),
  ].join(':');
}

export function getTtsUtteranceCacheKey(
  text: string,
  options: LocalTtsOptions,
  voiceRevision: string,
): string {
  return buildTtsUtteranceCacheKey(text, options, voiceRevision);
}

export async function readTtsUtteranceCache(key: string): Promise<CachedUtterance | null> {
  const expected = getUtteranceCacheKeyParts(key);
  if (!expected) return null;

  const { metaPath, pcmPath } = getUtteranceCachePaths(key);
  try {
    const [pcm, rawMeta] = await Promise.all([
      readFile(pcmPath),
      readFile(metaPath, 'utf8'),
    ]);
    const meta = parseUtteranceCacheMeta(rawMeta);
    if (
      !meta
      || meta.key !== key
      || meta.voiceRevision !== expected.voiceRevision
      || meta.sampleRate !== expected.sampleRate
      || pcm.byteLength !== meta.byteLength
      || pcm.byteLength % 2 !== 0
    ) {
      return null;
    }

    return {
      durationMs: meta.durationMs,
      pcm,
      sampleRate: meta.sampleRate,
      voiceRevision: meta.voiceRevision,
    };
  } catch {
    return null;
  }
}

async function indexUtteranceCache(dir: string): Promise<UtteranceCacheIndexEntry[]> {
  const names = await readdir(dir);
  const byDigest = new Map<string, { metaName?: string; pcmName?: string }>();

  for (const name of names) {
    if (name.endsWith('.meta.json')) {
      const digest = name.slice(0, -'.meta.json'.length);
      const entry = byDigest.get(digest) ?? {};
      entry.metaName = name;
      byDigest.set(digest, entry);
      continue;
    }
    if (name.endsWith('.pcm')) {
      const digest = name.slice(0, -'.pcm'.length);
      const entry = byDigest.get(digest) ?? {};
      entry.pcmName = name;
      byDigest.set(digest, entry);
    }
  }

  const entries: UtteranceCacheIndexEntry[] = [];
  for (const [digest, files] of byDigest) {
    const metaPath = files.metaName ? path.join(dir, files.metaName) : '';
    const pcmPath = files.pcmName ? path.join(dir, files.pcmName) : '';
    let createdAt = 0;
    let byteLength = 0;

    if (metaPath) {
      try {
        const meta = parseUtteranceCacheMeta(await readFile(metaPath, 'utf8'));
        if (meta) {
          createdAt = meta.createdAt;
          byteLength = meta.byteLength;
        }
      } catch {
        // Fall back to pcm mtime/size below.
      }
    }

    if (pcmPath) {
      try {
        const info = await stat(pcmPath);
        if (!createdAt) createdAt = info.mtimeMs;
        if (!byteLength) byteLength = info.size;
      } catch {
        // Skip a missing pcm; the entry can still be pruned via its meta file.
      }
    } else if (metaPath && !createdAt) {
      try {
        createdAt = (await stat(metaPath)).mtimeMs;
      } catch {
        createdAt = 0;
      }
    }

    entries.push({ byteLength, createdAt, digest, metaPath, pcmPath });
  }

  return entries;
}

async function pruneUtteranceCache(dir: string): Promise<void> {
  const entries = await indexUtteranceCache(dir);
  entries.sort((left, right) => left.createdAt - right.createdAt || left.digest.localeCompare(right.digest));

  let fileCount = entries.filter(entry => entry.pcmPath).length;
  let totalBytes = entries.reduce((sum, entry) => sum + entry.byteLength, 0);

  for (const entry of entries) {
    if (fileCount <= MAX_UTTERANCE_CACHE_FILES && totalBytes <= MAX_UTTERANCE_CACHE_BYTES) {
      return;
    }

    try {
      if (entry.pcmPath) {
        await unlink(entry.pcmPath);
        fileCount -= 1;
        totalBytes = Math.max(0, totalBytes - entry.byteLength);
      }
    } catch {
      // Best-effort prune.
    }

    if (entry.metaPath) {
      try {
        await unlink(entry.metaPath);
      } catch {
        // Best-effort prune.
      }
    }
  }
}

export async function rememberTtsUtterance(
  key: string,
  pcm: Buffer,
  meta: TtsUtteranceCacheWriteMeta,
): Promise<void> {
  if (pcm.byteLength % 2 !== 0) return;

  const expected = getUtteranceCacheKeyParts(key);
  if (
    !expected
    || meta.voiceRevision !== expected.voiceRevision
    || meta.sampleRate !== expected.sampleRate
  ) {
    return;
  }

  const dir = getUtteranceCacheDir();
  const { metaPath, pcmPath } = getUtteranceCachePaths(key);
  const record: UtteranceCacheMeta = {
    byteLength: pcm.byteLength,
    createdAt: Date.now(),
    durationMs: meta.durationMs,
    key,
    sampleRate: meta.sampleRate,
    voiceRevision: meta.voiceRevision,
  };

  await mkdir(dir, { recursive: true });
  await writeFile(pcmPath, pcm);
  await writeFile(metaPath, JSON.stringify(record));

  try {
    await pruneUtteranceCache(dir);
  } catch {
    // Best-effort prune.
  }
}

export async function runCoalescedTtsJob(
  key: string,
  factory: () => Promise<CachedUtterance>,
): Promise<CachedUtterance> {
  const pending = pendingByKey.get(key);
  if (pending) return pending;

  const job = factory().finally(() => {
    if (pendingByKey.get(key) === job) {
      pendingByKey.delete(key);
    }
  });
  pendingByKey.set(key, job);
  return job;
}

async function createUtteranceFromWorker(
  text: string,
  options: LocalTtsOptions,
  voiceRevision: string,
  signal?: AbortSignal,
): Promise<CachedUtterance> {
  const parts: Buffer[] = [];
  let sampleRate = SAMPLE_RATE;

  for await (const chunk of streamLocalTts(text, options, signal)) {
    parts.push(chunk.audio);
    sampleRate = chunk.sampleRate;
  }

  const pcm = Buffer.concat(parts);
  return {
    durationMs: Math.round(pcm.length / 2 / sampleRate * 1000),
    pcm,
    sampleRate,
    voiceRevision,
  };
}

async function getOrCreateCachedUtterance(
  text: string,
  options: LocalTtsOptions,
  signal?: AbortSignal,
): Promise<CachedUtterance> {
  throwIfAborted(signal);
  const voiceRevision = await getLocalTtsVoiceRevision();
  throwIfAborted(signal);
  const key = buildTtsUtteranceCacheKey(text, options, voiceRevision);

  const cached = await readTtsUtteranceCache(key);
  if (cached) {
    throwIfAborted(signal);
    return cached;
  }

  return runCoalescedTtsJob(key, async () => {
    throwIfAborted(signal);
    const raced = await readTtsUtteranceCache(key);
    if (raced) return raced;

    const created = await runWithLocalTtsSlot(
      () => createUtteranceFromWorker(text, options, voiceRevision, signal),
      signal,
    );

    if (created.sampleRate === SAMPLE_RATE && created.pcm.byteLength % 2 === 0) {
      try {
        await rememberTtsUtterance(key, created.pcm, {
          durationMs: created.durationMs,
          sampleRate: created.sampleRate,
          voiceRevision,
        });
      } catch {
        // Serving the just-synthesized audio is more important than persisting it.
      }
    }

    return created;
  });
}

export async function synthesizeLocalTtsCached(
  text: string,
  options: LocalTtsOptions,
  signal?: AbortSignal,
): Promise<Buffer> {
  const chunks = splitTextForLocalTts(text);
  if (chunks.length === 0) {
    return encodePcm16BufferWav(Buffer.alloc(0), SAMPLE_RATE);
  }

  const utterance = await getOrCreateCachedUtterance(text, options, signal);
  return encodePcm16BufferWav(utterance.pcm, utterance.sampleRate);
}

export async function* streamLocalTtsCached(
  text: string,
  options: LocalTtsOptions,
  signal?: AbortSignal,
): AsyncGenerator<LocalTtsChunk> {
  const chunks = splitTextForLocalTts(text);
  if (chunks.length === 0) return;

  const utterance = await getOrCreateCachedUtterance(text, options, signal);
  throwIfAborted(signal);
  yield {
    audio: utterance.pcm,
    durationMs: utterance.durationMs,
    index: 0,
    sampleRate: utterance.sampleRate,
    text: chunks[0] ?? '',
    voiceRevision: utterance.voiceRevision,
  };
}

export function __resetTtsUtteranceCacheForTests(): void {
  pendingByKey.clear();
}
