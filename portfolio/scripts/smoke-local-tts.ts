import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { adaptTextForKokoroTts } from '../lib/ttsPrompts';

const MODEL_ID = process.env.LOCAL_TTS_MODEL_ID ?? 'onnx-community/Kokoro-82M-v1.0-ONNX';
const DEFAULT_TEXT = 'Hello from local Kokoro. The CPU model is loaded and speaking.';
const OUTPUT_PATH = process.env.LOCAL_TTS_OUTPUT ?? path.join('tmp', 'local-tts-smoke.wav');
const DEFAULT_THREADS = process.env.LOCAL_TTS_INTRA_OP_THREADS ?? '1';

const ALLOWED_DTYPES = ['q8', 'fp32', 'fp16', 'q4', 'q4f16'] as const;
const ALLOWED_DEVICES = ['cpu', 'wasm'] as const;
const ALLOWED_VOICES = [
  'af_heart',
  'af_bella',
  'af_nicole',
  'am_fenrir',
  'am_michael',
  'am_puck',
  'bf_emma',
  'bm_george',
] as const;

type KokoroDtype = (typeof ALLOWED_DTYPES)[number];
type KokoroDevice = (typeof ALLOWED_DEVICES)[number];
type KokoroVoice = (typeof ALLOWED_VOICES)[number];

function pick<const T extends readonly string[]>(value: string | undefined, allowed: T, fallback: T[number]): T[number] {
  if (value && (allowed as readonly string[]).includes(value)) {
    return value as T[number];
  }

  return fallback;
}

function configureCpuDefaults(): void {
  process.env.OMP_NUM_THREADS ??= DEFAULT_THREADS;
  process.env.OMP_WAIT_POLICY ??= 'PASSIVE';
  process.env.OPENBLAS_NUM_THREADS ??= '1';
  process.env.MKL_NUM_THREADS ??= '1';
}

function resolveText(): string {
  const argvText = process.argv.slice(2).join(' ').trim();
  return argvText || process.env.LOCAL_TTS_TEXT || DEFAULT_TEXT;
}

async function main(): Promise<void> {
  configureCpuDefaults();

  const dtype = pick(process.env.LOCAL_TTS_DTYPE, ALLOWED_DTYPES, 'q4') as KokoroDtype;
  const device = pick(process.env.LOCAL_TTS_DEVICE, ALLOWED_DEVICES, 'cpu') as KokoroDevice;
  const voice = pick(process.env.LOCAL_TTS_VOICE, ALLOWED_VOICES, 'am_puck') as KokoroVoice;
  const visualText = resolveText();
  const text = adaptTextForKokoroTts(visualText);

  console.log('[tts:smoke] Loading Kokoro...', { device, dtype, model: MODEL_ID, voice });
  const loadStartedAt = performance.now();
  const { KokoroTTS } = await import('kokoro-js');
  const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
    device,
    dtype,
  });
  const loadMs = Math.round(performance.now() - loadStartedAt);

  console.log('[tts:smoke] Generating audio...', { spokenText: text, visualText });
  const generateStartedAt = performance.now();
  const audio = await tts.generate(text, { voice });
  const generateMs = Math.round(performance.now() - generateStartedAt);

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await audio.save(OUTPUT_PATH);

  const seconds = audio.audio.length / audio.sampling_rate;
  console.log('[tts:smoke] Done', {
    audioSeconds: Number(seconds.toFixed(2)),
    generateMs,
    loadMs,
    output: OUTPUT_PATH,
    sampleRate: audio.sampling_rate,
  });
}

main().catch((error: unknown) => {
  console.error('[tts:smoke] Failed', error);
  process.exitCode = 1;
});
