import 'server-only';

import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { phonemize } from 'phonemizer';

const MODEL_ID = process.env.LOCAL_TTS_MODEL_ID ?? 'onnx-community/Kokoro-82M-v1.0-ONNX';
const DEFAULT_CACHE_DIR = path.join(process.cwd(), '.cache', 'kokoro-tts');
const SAMPLE_RATE = 24_000;
const DEFAULT_CHUNK_CHARS = 160;
const MAX_CHUNK_CHARS = 320;
const MAX_TEXT_CHARS = 1_200;
const DEFAULT_SPEED = 1;
const MIN_SPEED = 0.75;
const MAX_SPEED = 1.25;

const ALLOWED_DTYPES = ['q8', 'fp32', 'fp16', 'q4', 'q4f16'] as const;
const ALLOWED_DEVICES = ['cpu', 'wasm'] as const;
const ALLOWED_VOICES = [
  'af_heart',
  'af_alloy',
  'af_aoede',
  'af_bella',
  'af_jessica',
  'af_kore',
  'af_nicole',
  'af_nova',
  'af_river',
  'af_sarah',
  'af_sky',
  'am_adam',
  'am_echo',
  'am_eric',
  'am_fenrir',
  'am_liam',
  'am_michael',
  'am_onyx',
  'am_puck',
  'am_santa',
  'bf_alice',
  'bf_emma',
  'bf_isabella',
  'bf_lily',
  'bm_daniel',
  'bm_fable',
  'bm_george',
  'bm_lewis',
] as const;

type LocalTtsDtype = (typeof ALLOWED_DTYPES)[number];
type LocalTtsDevice = (typeof ALLOWED_DEVICES)[number];
export type LocalTtsVoice = (typeof ALLOWED_VOICES)[number];

interface RawAudioLike {
  audio: Float32Array;
  sampling_rate: number;
}

interface KokoroTtsLike {
  generate(text: string, options?: { voice?: LocalTtsVoice; speed?: number }): Promise<RawAudioLike>;
}

interface TensorLike {
  data: unknown;
  dims: number[];
}

interface TensorConstructor {
  new (type: 'float32', data: Float32Array | number[], dims: number[]): TensorLike;
}

interface OptimizedModel {
  (inputs: Record<string, TensorLike>): Promise<{ waveform: { data: Float32Array } }>;
}

interface OptimizedTokenizer {
  (text: string, options?: { truncation?: boolean }): { input_ids: TensorLike };
}

interface KokoroModule {
  KokoroTTS: {
    new (model: never, tokenizer: never): KokoroTtsLike;
    from_pretrained(
      modelId: string,
      options?: {
        dtype?: LocalTtsDtype;
        device?: LocalTtsDevice;
        progress_callback?: ((progress: unknown) => void) | null;
      },
    ): Promise<KokoroTtsLike>;
  };
}

interface TransformersRuntime {
  env?: {
    allowLocalModels?: boolean;
    allowRemoteModels?: boolean;
    cacheDir?: string;
    logLevel?: number;
    useFSCache?: boolean;
  };
  AutoTokenizer: {
    from_pretrained(modelId: string, options?: TransformersLoadOptions): Promise<OptimizedTokenizer>;
  };
  StyleTextToSpeech2Model: {
    from_pretrained(modelId: string, options?: TransformersLoadOptions): Promise<OptimizedModel>;
  };
  Tensor: TensorConstructor;
}

interface TransformersLoadOptions {
  cache_dir?: string;
  device?: LocalTtsDevice;
  dtype?: LocalTtsDtype;
  progress_callback?: ((progress: unknown) => void) | null;
  session_options?: OnnxSessionOptions;
}

interface OnnxSessionOptions {
  enableCpuMemArena: boolean;
  enableMemPattern: boolean;
  executionMode: 'sequential';
  graphOptimizationLevel: 'all';
  interOpNumThreads: number;
  intraOpNumThreads: number;
  logSeverityLevel: number;
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
  device: LocalTtsDevice;
  dtype: LocalTtsDtype;
  interOpThreads: number;
  intraOpThreads: number;
  maxQueue: number;
  maxTextChars: number;
  modelId: string;
  optimizedLoader: boolean;
}

class TtsQueueFullError extends Error {
  constructor() {
    super('Local TTS queue is full. Try again in a moment.');
    this.name = 'TtsQueueFullError';
  }
}

class TtsRequestAbortedError extends Error {
  constructor() {
    super('Local TTS request was cancelled.');
    this.name = 'TtsRequestAbortedError';
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

function getEnvChoice<const T extends readonly string[]>(name: string, allowed: T, fallback: T[number]): T[number] {
  const raw = process.env[name];
  if (raw && (allowed as readonly string[]).includes(raw)) {
    return raw as T[number];
  }

  return fallback;
}

function getCpuCount(): number {
  return Math.max(1, os.availableParallelism?.() ?? os.cpus().length ?? 1);
}

function getDefaultIntraOpThreads(): number {
  return 1;
}

function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return DEFAULT_SPEED;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

function getSettings(): LocalTtsSettings {
  const cpuCount = getCpuCount();
  const intraOpThreads = getEnvInt('LOCAL_TTS_INTRA_OP_THREADS', getDefaultIntraOpThreads(), 1, cpuCount);

  return {
    cacheDir: process.env.LOCAL_TTS_CACHE_DIR ?? DEFAULT_CACHE_DIR,
    chunkChars: getEnvInt('LOCAL_TTS_CHUNK_CHARS', DEFAULT_CHUNK_CHARS, 80, MAX_CHUNK_CHARS),
    concurrency: getEnvInt('LOCAL_TTS_CONCURRENCY', 1, 1, 2),
    device: getEnvChoice('LOCAL_TTS_DEVICE', ALLOWED_DEVICES, 'cpu'),
    dtype: getEnvChoice('LOCAL_TTS_DTYPE', ALLOWED_DTYPES, 'q4'),
    interOpThreads: getEnvInt('LOCAL_TTS_INTER_OP_THREADS', 1, 1, 2),
    intraOpThreads,
    maxQueue: getEnvInt('LOCAL_TTS_MAX_QUEUE', 4, 0, 16),
    maxTextChars: getEnvInt('LOCAL_TTS_MAX_TEXT_CHARS', MAX_TEXT_CHARS, 80, 4_000),
    modelId: MODEL_ID,
    optimizedLoader: process.env.LOCAL_TTS_OPTIMIZED_LOADER === '1',
  };
}

export function getLocalTtsSettings(): LocalTtsSettings {
  return getSettings();
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

function getOnnxSessionOptions(settings: LocalTtsSettings): OnnxSessionOptions {
  return {
    enableCpuMemArena: true,
    enableMemPattern: true,
    executionMode: 'sequential',
    graphOptimizationLevel: 'all',
    interOpNumThreads: settings.interOpThreads,
    intraOpNumThreads: settings.intraOpThreads,
    logSeverityLevel: 3,
  };
}

async function importKokoro(): Promise<KokoroModule> {
  return await import('kokoro-js') as KokoroModule;
}

async function importKokoroTransformers(): Promise<TransformersRuntime> {
  const relativeBundle = path.join(
    'node_modules',
    'kokoro-js',
    'node_modules',
    '@huggingface',
    'transformers',
    'dist',
    'transformers.node.cjs',
  );
  const serverDir = process.argv[1] ? path.dirname(process.argv[1]) : process.cwd();
  const candidates = [
    path.join(process.cwd(), relativeBundle),
    path.join(process.cwd(), '.next', 'standalone', relativeBundle),
    path.join(serverDir, relativeBundle),
  ];
  const transformersBundle = candidates.find(candidate => path.isAbsolute(candidate) && existsSync(candidate));

  if (!transformersBundle) {
    throw new Error('Unable to resolve kokoro-js nested Transformers.js bundle.');
  }

  const nativeRequire = createRequire(path.join(process.cwd(), 'local-tts-loader.cjs'));
  return nativeRequire(transformersBundle) as TransformersRuntime;
}

const voiceCache = new Map<LocalTtsVoice, Promise<Float32Array>>();

function normalizeForPhonemizer(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function phonemizeForKokoro(text: string, voice: LocalTtsVoice): Promise<string> {
  const language = voice.startsWith('af_') || voice.startsWith('am_') ? 'en-us' : 'en';
  const phonemes = (await phonemize(normalizeForPhonemizer(text), language)).join(' ');

  return phonemes
    .replace(/kəkˈoːɹoʊ/g, 'kˈoʊkəɹoʊ')
    .replace(/kəkˈɔːɹəʊ/g, 'kˈəʊkəɹəʊ')
    .replace(/ʲ/g, 'j')
    .replace(/r/g, 'ɹ')
    .replace(/x/g, 'k')
    .replace(/ɬ/g, 'l')
    .trim();
}

function getVoicePathCandidates(voice: LocalTtsVoice): string[] {
  const relativeVoicePath = path.join('node_modules', 'kokoro-js', 'voices', `${voice}.bin`);
  const serverDir = process.argv[1] ? path.dirname(process.argv[1]) : process.cwd();

  return [
    path.join(process.cwd(), relativeVoicePath),
    path.join(process.cwd(), '.next', 'standalone', relativeVoicePath),
    path.join(serverDir, relativeVoicePath),
  ];
}

async function loadVoiceVector(voice: LocalTtsVoice): Promise<Float32Array> {
  const existing = voiceCache.get(voice);
  if (existing) return existing;

  const promise = (async () => {
    const voicePath = getVoicePathCandidates(voice).find(candidate => existsSync(candidate));
    if (!voicePath) {
      throw new Error(`Unable to resolve Kokoro voice file for ${voice}.`);
    }

    const buffer = await readFile(voicePath);
    const view = new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 4));
    return new Float32Array(view);
  })();

  voiceCache.set(voice, promise);
  return promise;
}

async function loadOptimizedTts(settings: LocalTtsSettings): Promise<KokoroTtsLike> {
  const transformers = await importKokoroTransformers();

  if (transformers.env) {
    transformers.env.allowLocalModels = true;
    transformers.env.allowRemoteModels = true;
    transformers.env.cacheDir = settings.cacheDir;
    transformers.env.logLevel = 40;
    transformers.env.useFSCache = true;
  }

  const loadOptions: TransformersLoadOptions = {
    cache_dir: settings.cacheDir,
    device: settings.device,
    dtype: settings.dtype,
    progress_callback: null,
    session_options: getOnnxSessionOptions(settings),
  };

  const [model, tokenizer] = await Promise.all([
    transformers.StyleTextToSpeech2Model.from_pretrained(settings.modelId, loadOptions),
    transformers.AutoTokenizer.from_pretrained(settings.modelId, {
      cache_dir: settings.cacheDir,
      progress_callback: null,
    }),
  ]);

  return {
    async generate(text, options = {}) {
      const voice = options.voice ?? 'af_heart';
      const speed = options.speed ?? DEFAULT_SPEED;
      const phonemes = await phonemizeForKokoro(text, voice);
      const { input_ids: inputIds } = tokenizer(phonemes, { truncation: true });
      const tokenLength = inputIds.dims.at(-1) ?? 0;
      const styleOffset = 256 * Math.min(Math.max(tokenLength - 2, 0), 509);
      const voiceVector = await loadVoiceVector(voice);
      const style = voiceVector.slice(styleOffset, styleOffset + 256);
      const { waveform } = await model({
        input_ids: inputIds,
        speed: new transformers.Tensor('float32', [speed], [1]),
        style: new transformers.Tensor('float32', style, [1, 256]),
      });

      return {
        audio: waveform.data,
        sampling_rate: SAMPLE_RATE,
      };
    },
  };
}

async function loadFallbackTts(settings: LocalTtsSettings): Promise<KokoroTtsLike> {
  const kokoro = await importKokoro();
  return await kokoro.KokoroTTS.from_pretrained(settings.modelId, {
    device: settings.device,
    dtype: settings.dtype,
    progress_callback: null,
  });
}

let ttsPromise: Promise<KokoroTtsLike> | null = null;
let activeJobs = 0;
let queuedJobs = 0;
const waiters: Array<() => void> = [];

async function loadLocalTts(): Promise<KokoroTtsLike> {
  if (ttsPromise) return ttsPromise;

  ttsPromise = (async () => {
    const settings = getSettings();
    configureCpuRuntime(settings);
    await mkdir(settings.cacheDir, { recursive: true });

    if (settings.optimizedLoader) {
      try {
        return await loadOptimizedTts(settings);
      } catch (error) {
        console.warn('[local-tts] Optimized loader failed; falling back to kokoro-js defaults.', error);
      }
    }

    return await loadFallbackTts(settings);
  })().catch((error) => {
    ttsPromise = null;
    throw error;
  });

  return ttsPromise;
}

export async function preloadLocalTts(): Promise<void> {
  const settings = getSettings();
  const tts = await loadLocalTts();
  await tts.generate('Ready.', { speed: DEFAULT_SPEED, voice: 'af_heart' });
  console.info('[local-tts] Warmed Kokoro TTS', {
    device: settings.device,
    dtype: settings.dtype,
    intraOpThreads: settings.intraOpThreads,
  });
}

function releaseTtsSlot(): void {
  activeJobs = Math.max(0, activeJobs - 1);
  const next = waiters.shift();
  if (next) next();
}

export function getLocalTtsQueueState(): { active: number; queued: number } {
  return { active: activeJobs, queued: queuedJobs };
}

export async function runWithLocalTtsSlot<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const settings = getSettings();
  throwIfAborted(signal);

  if (activeJobs >= settings.concurrency) {
    if (queuedJobs >= settings.maxQueue) {
      throw new TtsQueueFullError();
    }

    queuedJobs += 1;
    try {
      await new Promise<void>((resolve, reject) => {
        const waiter = () => {
          signal?.removeEventListener('abort', abortWaiter);
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
  }

  throwIfAborted(signal);
  activeJobs += 1;
  try {
    return await task();
  } finally {
    releaseTtsSlot();
  }
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
  const voice = typeof input.voice === 'string' && (ALLOWED_VOICES as readonly string[]).includes(input.voice)
    ? input.voice as LocalTtsVoice
    : 'af_heart';
  const speed = typeof input.speed === 'number' ? clampSpeed(input.speed) : DEFAULT_SPEED;

  return { speed, voice };
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
  const tts = await loadLocalTts();
  const audioChunks: Float32Array[] = [];

  for (const chunk of chunks) {
    throwIfAborted(signal);
    const audio = await tts.generate(chunk, options);
    throwIfAborted(signal);
    audioChunks.push(audio.audio);
  }

  return encodePcm16Wav(concatFloat32(audioChunks), SAMPLE_RATE);
}

export async function* streamLocalTts(text: string, options: LocalTtsOptions, signal?: AbortSignal): AsyncGenerator<LocalTtsChunk> {
  const chunks = splitTextForLocalTts(text);
  throwIfAborted(signal);
  const tts = await loadLocalTts();

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    throwIfAborted(signal);
    const startedAt = performance.now();
    const audio = await tts.generate(chunks[chunkIndex], options);
    throwIfAborted(signal);
    yield {
      audio: audio.audio,
      durationMs: Math.round(performance.now() - startedAt),
      index: chunkIndex,
      sampleRate: audio.sampling_rate || SAMPLE_RATE,
      text: chunks[chunkIndex],
    };
  }
}
