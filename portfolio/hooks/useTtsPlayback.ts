"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createTtsAudioCacheKey,
  createTtsAudioTextHash,
  getCachedTtsAudio,
  putCachedTtsAudio,
  type CachedTtsAudio,
} from '@/lib/ttsAudioCache';
import { adaptTextForSpeech } from '@/lib/ttsPrompts';

export type TtsPlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export const TTS_PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2] as const;
export type TtsPlaybackSpeed = (typeof TTS_PLAYBACK_SPEEDS)[number];

interface TtsPlaybackState {
  activeMessageId: string | null;
  error: string | null;
  status: TtsPlaybackStatus;
}

interface TtsStreamMessage {
  audioBase64?: string;
  codec?: string;
  compression?: 'gzip' | 'none' | 'adaptive-gzip';
  message?: string;
  sampleRate?: number;
  type?: 'ready' | 'chunk' | 'done' | 'error';
  uncompressedBytes?: number;
  voiceRevision?: string;
}

interface UseTtsPlaybackResult extends TtsPlaybackState {
  clientSpeechSupported: boolean;
  playbackSpeed: TtsPlaybackSpeed;
  restart: (messageId: string, text: string, options?: TtsPlaybackToggleOptions) => Promise<void>;
  setPlaybackSpeed: (speed: TtsPlaybackSpeed) => void;
  stop: () => void;
  toggle: (messageId: string, text: string, options?: TtsPlaybackToggleOptions) => Promise<void>;
}

interface TtsPlaybackToggleOptions {
  preferClientSpeech?: boolean;
}

interface UseTtsPlaybackOptions {
  preferClientSpeech?: boolean;
}

const INITIAL_STATE: TtsPlaybackState = {
  activeMessageId: null,
  error: null,
  status: 'idle',
};

const DEFAULT_CODEC = 'pcm_s16le';
const DEFAULT_SAMPLE_RATE = 24_000;
const DEFAULT_PLAYBACK_SPEED: TtsPlaybackSpeed = 1;
const BROWSER_TTS_CHUNK_CHARS = 180;
const BROWSER_TTS_START_TIMEOUT_MS = 5_000;
const SCHEDULE_AHEAD_SECONDS = 0.035;
const BROWSER_TTS_VOICE_HINTS = ['natural', 'premium', 'google', 'microsoft', 'samantha', 'daniel', 'alex'];
const DEFAULT_TTS_SPEED = 1;
const DEFAULT_TTS_VOICE = 'custom-dhruv';
const TTS_REQUEST_OPTIONS = { provider: 'pocket-tts', speed: DEFAULT_TTS_SPEED, voice: DEFAULT_TTS_VOICE } as const;
const MAX_TTS_PCM_FRAME_BYTES = 1 * 1024 * 1024;
const MAX_TTS_PCM_TOTAL_BYTES = 32 * 1024 * 1024;
let gzipDecompressionSupported: boolean | null = null;

function isValidVoiceRevision(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

async function getServerVoiceRevision(signal: AbortSignal): Promise<string> {
  const response = await fetch('/api/tts', {
    cache: 'no-store',
    credentials: 'same-origin',
    method: 'GET',
    mode: 'same-origin',
    referrerPolicy: 'strict-origin-when-cross-origin',
    signal,
  });
  if (!response.ok) throw new Error(`TTS status request failed with ${response.status}`);

  const payload = await response.json() as { voiceRevision?: unknown };
  if (!isValidVoiceRevision(payload.voiceRevision)) {
    throw new Error('TTS status response did not include a valid voice revision.');
  }
  return payload.voiceRevision;
}

function getGeneratedAudioPlaybackRate(speed: TtsPlaybackSpeed): number {
  return speed / DEFAULT_TTS_SPEED;
}

function mergeArrayBuffers(buffers: readonly ArrayBuffer[]): ArrayBuffer {
  const byteLength = buffers.reduce((total, buffer) => total + buffer.byteLength, 0);
  const merged = new Uint8Array(byteLength);
  let offset = 0;
  for (const buffer of buffers) {
    merged.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  return merged.buffer;
}

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  return window.speechSynthesis ?? null;
}

function getSpeechSynthesisUtteranceCtor(): typeof SpeechSynthesisUtterance | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechSynthesisUtterance ?? null;
}

function supportsClientSpeechNow(): boolean {
  return !!getSpeechSynthesis() && !!getSpeechSynthesisUtteranceCtor();
}

function splitTextForBrowserSpeech(text: string): string[] {
  const chunks: string[] = [];
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);

  for (const sentence of sentences.length > 0 ? sentences : [text.trim()]) {
    if (sentence.length <= BROWSER_TTS_CHUNK_CHARS) {
      chunks.push(sentence);
      continue;
    }

    let remaining = sentence;
    while (remaining.length > BROWSER_TTS_CHUNK_CHARS) {
      const breakAt = Math.max(
        remaining.lastIndexOf(',', BROWSER_TTS_CHUNK_CHARS),
        remaining.lastIndexOf(';', BROWSER_TTS_CHUNK_CHARS),
        remaining.lastIndexOf(' ', BROWSER_TTS_CHUNK_CHARS),
      );
      const index = breakAt > 40 ? breakAt : BROWSER_TTS_CHUNK_CHARS;
      chunks.push(remaining.slice(0, index).trim());
      remaining = remaining.slice(index).trim();
    }
    if (remaining) chunks.push(remaining);
  }

  return chunks;
}

function pickBrowserSpeechVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const englishVoices = voices.filter(voice => voice.lang.toLowerCase().startsWith('en'));
  const candidates = englishVoices.length > 0 ? englishVoices : voices;
  return candidates.find((voice) => {
    const name = voice.name.toLowerCase();
    return BROWSER_TTS_VOICE_HINTS.some(hint => name.includes(hint));
  }) ?? candidates[0] ?? null;
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function supportsGzipDecompression(): boolean {
  if (gzipDecompressionSupported !== null) return gzipDecompressionSupported;

  try {
    new DecompressionStream('gzip');
    gzipDecompressionSupported = true;
  } catch {
    gzipDecompressionSupported = false;
  }
  return gzipDecompressionSupported;
}

function validatePcmChunk(buffer: ArrayBuffer, totalBytes: number): void {
  if (buffer.byteLength > MAX_TTS_PCM_FRAME_BYTES) {
    throw new Error('TTS audio frame exceeds the maximum PCM frame size.');
  }
  if (buffer.byteLength % 2 !== 0) {
    throw new Error('TTS audio frame is not valid 16-bit PCM.');
  }
  if (totalBytes + buffer.byteLength > MAX_TTS_PCM_TOTAL_BYTES) {
    throw new Error('TTS audio exceeds the maximum response size.');
  }
}

async function decompressGzipChunk(buffer: ArrayBuffer, expectedBytes: number, totalBytes: number): Promise<ArrayBuffer> {
  if (!supportsGzipDecompression()) {
    throw new Error('This browser cannot decompress TTS audio frames.');
  }

  if (!Number.isFinite(expectedBytes) || !Number.isInteger(expectedBytes) || expectedBytes < 0) {
    throw new Error('TTS compressed audio frame has invalid length metadata.');
  }
  if (expectedBytes > MAX_TTS_PCM_FRAME_BYTES || totalBytes + expectedBytes > MAX_TTS_PCM_TOTAL_BYTES) {
    throw new Error('TTS compressed audio frame exceeds the maximum PCM size.');
  }

  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let outputBytes = 0;
  let failed = true;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      outputBytes += value.byteLength;
      if (outputBytes > expectedBytes || outputBytes > MAX_TTS_PCM_FRAME_BYTES || totalBytes + outputBytes > MAX_TTS_PCM_TOTAL_BYTES) {
        throw new Error('TTS decompressed audio frame exceeds its declared PCM size.');
      }
      chunks.push(value);
    }
    if (outputBytes !== expectedBytes) {
      throw new Error('TTS audio frame length did not match its compressed payload metadata.');
    }

    const output = new Uint8Array(outputBytes);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    validatePcmChunk(output.buffer, totalBytes);
    failed = false;
    return output.buffer;
  } finally {
    if (failed) {
      try { await reader.cancel(); } catch { /* Preserve the decompression error. */ }
    }
    reader.releaseLock();
  }
}

function decodePcm16(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  const samples = new Float32Array(Math.floor(buffer.byteLength / 2));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 0x8000;
  }
  return samples;
}

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

function createAudioContext(): AudioContext {
  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) {
    throw new Error('Audio playback is not supported in this browser.');
  }

  try {
    return new AudioContextCtor({ sampleRate: DEFAULT_SAMPLE_RATE });
  } catch {
    return new AudioContextCtor();
  }
}

function playSilentUnlockBuffer(context: AudioContext): void {
  try {
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = context.createBuffer(1, 1, context.sampleRate || DEFAULT_SAMPLE_RATE);
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(context.destination);
    source.onended = () => {
      try { source.disconnect(); } catch { /* no-op */ }
      try { gain.disconnect(); } catch { /* no-op */ }
    };
    source.start(0);
  } catch {
    /* no-op — context.resume() is the important unlock signal. */
  }
}

export function useTtsPlayback({ preferClientSpeech = false }: UseTtsPlaybackOptions = {}): UseTtsPlaybackResult {
  const [state, setState] = useState<TtsPlaybackState>(INITIAL_STATE);
  const [clientSpeechSupported, setClientSpeechSupported] = useState(false);
  const [playbackSpeed, setPlaybackSpeedState] = useState<TtsPlaybackSpeed>(DEFAULT_PLAYBACK_SPEED);
  const abortRef = useRef<AbortController | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const browserSpeechCancelRef = useRef<(() => void) | null>(null);
  const browserSpeechRestartRef = useRef<(() => void) | null>(null);
  const browserUtterancesRef = useRef<SpeechSynthesisUtterance[]>([]);
  const fallbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const fallbackObjectUrlRef = useRef<string | null>(null);
  const fallbackPlaybackSettlerRef = useRef<(() => void) | null>(null);
  const pendingSourcesRef = useRef(0);
  const playbackModeRef = useRef<'browser' | 'stream' | 'wav' | null>(null);
  const playbackIdRef = useRef(0);
  const requestedClientSpeechRef = useRef<boolean | null>(null);
  const playbackSpeedRef = useRef<TtsPlaybackSpeed>(DEFAULT_PLAYBACK_SPEED);
  const scheduledUntilRef = useRef(0);
  const sourceRefs = useRef<Set<AudioBufferSourceNode>>(new Set());
  const stateRef = useRef<TtsPlaybackState>(INITIAL_STATE);
  const streamDoneRef = useRef(false);
  const audioUnlockPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const synth = getSpeechSynthesis();
    const supported = supportsClientSpeechNow();
    setClientSpeechSupported(supported);
    if (!synth || !supported) return;

    const handleVoicesChanged = () => setClientSpeechSupported(true);
    synth.addEventListener('voiceschanged', handleVoicesChanged);
    return () => synth.removeEventListener('voiceschanged', handleVoicesChanged);
  }, []);

  const releaseFallbackObjectUrl = useCallback(() => {
    if (!fallbackObjectUrlRef.current) return;
    URL.revokeObjectURL(fallbackObjectUrlRef.current);
    fallbackObjectUrlRef.current = null;
  }, []);

  const finishPlaybackIfDone = useCallback((playbackId: number) => {
    if (playbackIdRef.current !== playbackId) return;
    if (!streamDoneRef.current || pendingSourcesRef.current > 0) return;

    const context = audioContextRef.current;
    audioContextRef.current = null;
    audioUnlockPromiseRef.current = null;
    if (context && context.state !== 'closed') {
      void context.close().catch(() => {});
    }
    setState(INITIAL_STATE);
  }, []);

  const clearGeneratedAudio = useCallback(() => {
    streamDoneRef.current = false;
    pendingSourcesRef.current = 0;
    scheduledUntilRef.current = 0;

    sourceRefs.current.forEach((source) => {
      source.onended = null;
      try { source.stop(); } catch { /* already stopped */ }
      try { source.disconnect(); } catch { /* no-op */ }
    });
    sourceRefs.current.clear();

    const context = audioContextRef.current;
    audioContextRef.current = null;
    audioUnlockPromiseRef.current = null;
    if (context && context.state !== 'closed') {
      void context.close().catch(() => {});
    }
  }, []);

  const clearFallbackAudio = useCallback((expectedAudio?: HTMLAudioElement, expectedObjectUrl?: string) => {
    if (expectedAudio && fallbackAudioRef.current !== expectedAudio) return;
    if (expectedObjectUrl && fallbackObjectUrlRef.current !== expectedObjectUrl) return;
    const fallbackAudio = fallbackAudioRef.current;
    fallbackAudioRef.current = null;
    if (fallbackAudio) {
      fallbackAudio.onended = null;
      fallbackAudio.onerror = null;
      fallbackAudio.pause();
      fallbackAudio.removeAttribute('src');
      fallbackAudio.load();
    }
    releaseFallbackObjectUrl();
  }, [releaseFallbackObjectUrl]);

  const disposeFallbackAudio = useCallback(() => {
    const settleFallbackPlayback = fallbackPlaybackSettlerRef.current;
    fallbackPlaybackSettlerRef.current = null;
    clearFallbackAudio();
    settleFallbackPlayback?.();
  }, [clearFallbackAudio]);

  const cleanup = useCallback((resetState: boolean) => {
    playbackIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;

    const cancelBrowserSpeech = browserSpeechCancelRef.current;
    browserSpeechCancelRef.current = null;
    browserSpeechRestartRef.current = null;

    browserUtterancesRef.current.forEach((utterance) => {
      utterance.onend = null;
      utterance.onerror = null;
      utterance.onpause = null;
      utterance.onresume = null;
      utterance.onstart = null;
    });
    browserUtterancesRef.current = [];
    if (playbackModeRef.current === 'browser') {
      getSpeechSynthesis()?.cancel();
      cancelBrowserSpeech?.();
    }
    playbackModeRef.current = null;
    requestedClientSpeechRef.current = null;

    clearGeneratedAudio();
    disposeFallbackAudio();
    if (resetState) setState(INITIAL_STATE);
  }, [clearGeneratedAudio, disposeFallbackAudio]);

  const stop = useCallback(() => {
    cleanup(true);
  }, [cleanup]);

  const setPlaybackSpeed = useCallback((speed: TtsPlaybackSpeed) => {
    playbackSpeedRef.current = speed;
    setPlaybackSpeedState(speed);
    const generatedAudioRate = getGeneratedAudioPlaybackRate(speed);

    if (playbackModeRef.current === 'wav' && fallbackAudioRef.current) {
      fallbackAudioRef.current.playbackRate = generatedAudioRate;
    }

    if (playbackModeRef.current === 'stream') {
      const context = audioContextRef.current;
      sourceRefs.current.forEach((source) => {
        const now = context?.currentTime ?? 0;
        try {
          source.playbackRate.cancelScheduledValues(now);
          source.playbackRate.setValueAtTime(generatedAudioRate, now);
        } catch {
          source.playbackRate.value = generatedAudioRate;
        }
      });
    }

    if (playbackModeRef.current === 'browser') {
      browserUtterancesRef.current.forEach((utterance) => {
        utterance.rate = speed;
      });
      if (stateRef.current.status === 'playing') {
        browserSpeechRestartRef.current?.();
      }
    }
  }, []);

  const primeGeneratedAudioPlayback = useCallback(() => {
    let context = audioContextRef.current;
    if (!context || context.state === 'closed') {
      context = createAudioContext();
      audioContextRef.current = context;
      scheduledUntilRef.current = context.currentTime + SCHEDULE_AHEAD_SECONDS;
    }

    playSilentUnlockBuffer(context);
    if (context.state === 'suspended') {
      const unlockPromise = context.resume();
      audioUnlockPromiseRef.current = unlockPromise;
      void unlockPromise.catch(() => {});
    }
  }, []);

  const ensureAudioContext = useCallback(async (): Promise<AudioContext> => {
    let context = audioContextRef.current;
    if (!context || context.state === 'closed') {
      context = createAudioContext();
      audioContextRef.current = context;
      scheduledUntilRef.current = context.currentTime + SCHEDULE_AHEAD_SECONDS;
    }
    const unlockPromise = audioUnlockPromiseRef.current;
    if (unlockPromise) {
      try {
        await unlockPromise;
      } finally {
        if (audioUnlockPromiseRef.current === unlockPromise) audioUnlockPromiseRef.current = null;
      }
    }
    if (context.state === 'suspended') {
      await context.resume();
    }
    return context;
  }, []);

  const schedulePcmChunk = useCallback((buffer: ArrayBuffer, sampleRate: number, playbackId: number, playbackRate: number): void => {
    const context = audioContextRef.current;
    if (!context || playbackIdRef.current !== playbackId) return;

    const samples = decodePcm16(buffer);
    if (samples.length === 0) return;

    const audioBuffer = context.createBuffer(1, samples.length, sampleRate);
    audioBuffer.getChannelData(0).set(samples);
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = playbackRate;
    source.connect(context.destination);

    const startAt = Math.max(context.currentTime + SCHEDULE_AHEAD_SECONDS, scheduledUntilRef.current);
    scheduledUntilRef.current = startAt + (audioBuffer.duration / playbackRate);
    pendingSourcesRef.current += 1;
    sourceRefs.current.add(source);
    source.onended = () => {
      sourceRefs.current.delete(source);
      pendingSourcesRef.current = Math.max(0, pendingSourcesRef.current - 1);
      finishPlaybackIfDone(playbackId);
    };
    source.start(startAt);
  }, [finishPlaybackIfDone]);

  const playCachedAudio = useCallback(async (cached: CachedTtsAudio, messageId: string, playbackId: number) => {
    await ensureAudioContext();
    if (playbackIdRef.current !== playbackId) return;

    playbackModeRef.current = 'stream';
    streamDoneRef.current = false;
    const audio = mergeArrayBuffers(cached.chunks);
    schedulePcmChunk(audio, cached.sampleRate, playbackId, getGeneratedAudioPlaybackRate(playbackSpeedRef.current));

    streamDoneRef.current = true;
    if (cached.chunks.length > 0) {
      if (stateRef.current.status !== 'paused') {
        setState({ activeMessageId: messageId, error: null, status: 'playing' });
      }
    }
    finishPlaybackIfDone(playbackId);
  }, [ensureAudioContext, finishPlaybackIfDone, schedulePcmChunk]);

  const playWavFallback = useCallback(async (messageId: string, text: string, abortController: AbortController, playbackId: number) => {
    clearGeneratedAudio();
    playbackModeRef.current = 'wav';
    const response = await fetch('/api/tts', {
      body: JSON.stringify({ text, ...TTS_REQUEST_OPTIONS }),
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      mode: 'same-origin',
      referrerPolicy: 'strict-origin-when-cross-origin',
      signal: abortController.signal,
    });
    if (!response.ok) throw new Error(`TTS request failed with ${response.status}`);

    const audioBlob = await response.blob();
    if (abortController.signal.aborted || playbackIdRef.current !== playbackId) return;

    const objectUrl = URL.createObjectURL(audioBlob);
    fallbackObjectUrlRef.current = objectUrl;
    const audio = new Audio(objectUrl);
    audio.playbackRate = getGeneratedAudioPlaybackRate(playbackSpeedRef.current);
    fallbackAudioRef.current = audio;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (error?: Error) => {
        if (settled) return;
        settled = true;
        if (fallbackPlaybackSettlerRef.current === cancel) {
          fallbackPlaybackSettlerRef.current = null;
        }
        clearFallbackAudio(audio, objectUrl);
        if (error) reject(error);
        else resolve();
      };
      const cancel = () => settle();
      fallbackPlaybackSettlerRef.current = cancel;

      audio.addEventListener('ended', () => {
        if (playbackIdRef.current !== playbackId || fallbackAudioRef.current !== audio) {
          settle();
          return;
        }
        setState(INITIAL_STATE);
        settle();
      }, { once: true });
      audio.addEventListener('error', () => {
        if (playbackIdRef.current !== playbackId || fallbackAudioRef.current !== audio) {
          settle();
          return;
        }
        settle(new Error('Could not play spoken response.'));
      }, { once: true });

      void audio.play().then(() => {
        if (playbackIdRef.current !== playbackId || fallbackAudioRef.current !== audio) return;
        setState({ activeMessageId: messageId, error: null, status: 'playing' });
      }).catch((error) => {
        if (playbackIdRef.current !== playbackId || fallbackAudioRef.current !== audio) {
          settle();
          return;
        }
        settle(error instanceof Error ? error : new Error('Could not play spoken response.'));
      });
    });
  }, [clearFallbackAudio, clearGeneratedAudio]);

  const streamAndCacheAudio = useCallback(async (
    messageId: string,
    requestText: string,
    spokenText: string,
    expectedVoiceRevision: string,
    abortController: AbortController,
    playbackId: number,
  ) => {
    await ensureAudioContext();
    if (playbackIdRef.current !== playbackId) return;

    playbackModeRef.current = 'stream';

    const response = await fetch('/api/tts', {
      body: JSON.stringify({ stream: true, text: requestText, ...TTS_REQUEST_OPTIONS }),
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/x-ndjson',
        'Content-Type': 'application/json',
        ...(supportsGzipDecompression() ? { 'X-TTS-Accept-Compression': 'gzip' } : {}),
      },
      method: 'POST',
      mode: 'same-origin',
      referrerPolicy: 'strict-origin-when-cross-origin',
      signal: abortController.signal,
    });
    if (!response.ok) throw new Error(`TTS request failed with ${response.status}`);
    if (!response.body) {
      await playWavFallback(messageId, requestText, abortController, playbackId);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const cachedChunks: ArrayBuffer[] = [];
    let byteLength = 0;
    let codec = DEFAULT_CODEC;
    let sampleRate = DEFAULT_SAMPLE_RATE;
    let pending = '';
    let receivedDoneFrame = false;
    let streamVoiceRevision: string | null = null;

    const handleLine = async (line: string): Promise<void> => {
      if (!line.trim() || playbackIdRef.current !== playbackId) return;
      const message = JSON.parse(line) as TtsStreamMessage;
      if (message.type === 'ready') {
        codec = message.codec ?? codec;
        sampleRate = message.sampleRate ?? sampleRate;
        if (!isValidVoiceRevision(message.voiceRevision)) {
          throw new Error('TTS stream did not include a valid voice revision.');
        }
        streamVoiceRevision = message.voiceRevision;
        return;
      }
      if (message.type === 'error') {
        throw new Error(message.message ?? 'Local TTS streaming failed.');
      }
      if (message.type === 'done') {
        receivedDoneFrame = true;
        return;
      }
      if (message.type !== 'chunk' || !message.audioBase64) return;
      if (!streamVoiceRevision) {
        throw new Error('TTS stream emitted audio before its ready frame.');
      }
      if (receivedDoneFrame) {
        throw new Error('TTS stream contained audio after its completion frame.');
      }

      let buffer = base64ToArrayBuffer(message.audioBase64);
      if (message.compression === 'gzip') {
        buffer = await decompressGzipChunk(buffer, message.uncompressedBytes as number, byteLength);
      } else {
        validatePcmChunk(buffer, byteLength);
      }
      const chunkSampleRate = message.sampleRate ?? sampleRate;
      sampleRate = chunkSampleRate;
      byteLength += buffer.byteLength;
      cachedChunks.push(buffer);
      schedulePcmChunk(buffer, chunkSampleRate, playbackId, getGeneratedAudioPlaybackRate(playbackSpeedRef.current));
      if (stateRef.current.status === 'loading') {
        const playingState = { activeMessageId: messageId, error: null, status: 'playing' as const };
        stateRef.current = playingState;
        setState(playingState);
      }
    };

    let completed = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (abortController.signal.aborted || playbackIdRef.current !== playbackId) return;
        pending += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) await handleLine(line);
        if (done) break;
      }

      if (pending.trim()) await handleLine(pending);
      if (!receivedDoneFrame || !streamVoiceRevision) {
        throw new Error('TTS stream ended before its completion frame.');
      }
      if (cachedChunks.length === 0 && spokenText.trim()) {
        throw new Error('TTS stream completed without any PCM audio.');
      }
      completed = true;
    } finally {
      if (!completed) {
        try { await reader.cancel(); } catch { /* Preserve the stream error. */ }
      }
      reader.releaseLock();
    }

    streamDoneRef.current = true;
    if (!abortController.signal.aborted && playbackIdRef.current === playbackId && cachedChunks.length > 0) {
      void putCachedTtsAudio({
        byteLength,
        cacheKey: createTtsAudioCacheKey(spokenText, {
          ...TTS_REQUEST_OPTIONS,
          voiceRevision: streamVoiceRevision ?? expectedVoiceRevision,
        }),
        chunks: cachedChunks,
        codec,
        messageId,
        sampleRate,
        speed: DEFAULT_TTS_SPEED,
        spokenText,
        textHash: createTtsAudioTextHash(spokenText),
        voice: DEFAULT_TTS_VOICE,
      });
    }
    finishPlaybackIfDone(playbackId);
  }, [ensureAudioContext, finishPlaybackIfDone, playWavFallback, schedulePcmChunk]);

  const playBrowserSpeech = useCallback(async (messageId: string, spokenText: string, playbackId: number) => {
    const synth = getSpeechSynthesis();
    const Utterance = getSpeechSynthesisUtteranceCtor();
    if (!synth || !Utterance) {
      throw new Error('Browser speech is not supported.');
    }

    const chunks = splitTextForBrowserSpeech(spokenText);
    if (chunks.length === 0) {
      throw new Error('Text is empty after normalization.');
    }

    synth.cancel();
    playbackModeRef.current = 'browser';
    streamDoneRef.current = true;

    const voice = pickBrowserSpeechVoice(synth.getVoices());
    setState({ activeMessageId: messageId, error: null, status: 'loading' });

    await new Promise<void>((resolve, reject) => {
      let currentIndex = 0;
      let currentUtterance: SpeechSynthesisUtterance | null = null;
      let finished = false;
      let startTimer: ReturnType<typeof setTimeout> | null = null;
      let restartTimer: ReturnType<typeof setTimeout> | null = null;

      const detachCurrent = () => {
        if (!currentUtterance) return;
        currentUtterance.onend = null;
        currentUtterance.onerror = null;
        currentUtterance.onpause = null;
        currentUtterance.onresume = null;
        currentUtterance.onstart = null;
        currentUtterance = null;
        browserUtterancesRef.current = [];
      };

      const clearRestartTimer = () => {
        if (restartTimer === null) return;
        clearTimeout(restartTimer);
        restartTimer = null;
      };

      const clearStartTimer = () => {
        if (startTimer === null) return;
        clearTimeout(startTimer);
        startTimer = null;
      };

      const settle = (callback: () => void, cancelQueuedSpeech = false) => {
        if (finished) return;
        finished = true;
        clearStartTimer();
        clearRestartTimer();
        detachCurrent();
        if (cancelQueuedSpeech) {
          try { synth.cancel(); } catch { /* no-op */ }
        }
        browserSpeechCancelRef.current = null;
        browserSpeechRestartRef.current = null;
        if (playbackModeRef.current === 'browser') playbackModeRef.current = null;
        callback();
      };

      const speakCurrent = () => {
        if (finished) return;
        if (playbackIdRef.current !== playbackId) {
          settle(resolve);
          return;
        }

        const chunk = chunks[currentIndex];
        if (!chunk) {
          if (playbackIdRef.current === playbackId) setState(INITIAL_STATE);
          settle(resolve);
          return;
        }

        const utterance = new Utterance(chunk);
        utterance.lang = voice?.lang ?? 'en-US';
        utterance.pitch = 1;
        utterance.rate = playbackSpeedRef.current;
        utterance.volume = 1;
        if (voice) utterance.voice = voice;
        currentUtterance = utterance;
        browserUtterancesRef.current = [utterance];

        clearStartTimer();
        startTimer = setTimeout(() => {
          if (finished || playbackIdRef.current !== playbackId) return;
          settle(() => reject(new Error('Browser speech did not start. Try generated voice instead.')), true);
        }, BROWSER_TTS_START_TIMEOUT_MS);

        utterance.onstart = () => {
          clearStartTimer();
          if (playbackIdRef.current === playbackId) {
            setState({ activeMessageId: messageId, error: null, status: 'playing' });
          }
        };
        utterance.onend = () => {
          clearStartTimer();
          detachCurrent();
          currentIndex += 1;
          speakCurrent();
        };
        utterance.onerror = (event) => {
          if (playbackIdRef.current !== playbackId || event.error === 'canceled' || event.error === 'interrupted') {
            return;
          }
          clearStartTimer();
          settle(() => reject(new Error(`Browser speech failed: ${event.error}`)), true);
        };
        utterance.onpause = () => {
          if (playbackIdRef.current === playbackId) {
            setState({ activeMessageId: messageId, error: null, status: 'paused' });
          }
        };
        utterance.onresume = () => {
          if (playbackIdRef.current === playbackId) {
            setState({ activeMessageId: messageId, error: null, status: 'playing' });
          }
        };

        try {
          synth.speak(utterance);
        } catch (error) {
          settle(() => reject(error instanceof Error ? error : new Error('Browser speech failed.')), true);
        }
      };

      browserSpeechCancelRef.current = () => settle(resolve, true);
      browserSpeechRestartRef.current = () => {
        if (finished || playbackIdRef.current !== playbackId) return;
        detachCurrent();
        try { synth.cancel(); } catch { /* no-op */ }
        clearRestartTimer();
        restartTimer = setTimeout(() => {
          restartTimer = null;
          speakCurrent();
        }, 0);
      };

      speakCurrent();
    });
  }, []);

  const startPlayback = useCallback(async (messageId: string, text: string, options?: TtsPlaybackToggleOptions) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    const shouldRequestClientSpeech = options?.preferClientSpeech ?? preferClientSpeech;
    cleanup(false);
    requestedClientSpeechRef.current = shouldRequestClientSpeech;
    const abortController = new AbortController();
    abortRef.current = abortController;
    const playbackId = playbackIdRef.current;
    const spokenText = adaptTextForSpeech(trimmedText);
    if (!spokenText) {
      setState(INITIAL_STATE);
      return;
    }
    setState({ activeMessageId: messageId, error: null, status: 'loading' });
    const shouldPreferClientSpeech = shouldRequestClientSpeech
      && (clientSpeechSupported || supportsClientSpeechNow());

    try {
      if (shouldPreferClientSpeech) {
        try { primeGeneratedAudioPlayback(); } catch { /* browser speech may still work without generated-audio fallback. */ }
      } else {
        primeGeneratedAudioPlayback();
      }
      if (abortController.signal.aborted || playbackIdRef.current !== playbackId) return;

      if (shouldPreferClientSpeech) {
        try {
          await playBrowserSpeech(messageId, spokenText, playbackId);
          return;
        } catch {
          if (abortController.signal.aborted || playbackIdRef.current !== playbackId) return;
          primeGeneratedAudioPlayback();
          const voiceRevision = await getServerVoiceRevision(abortController.signal);
          const cacheKey = createTtsAudioCacheKey(spokenText, { ...TTS_REQUEST_OPTIONS, voiceRevision });
          const cached = await getCachedTtsAudio(cacheKey, messageId, spokenText);
          if (abortController.signal.aborted || playbackIdRef.current !== playbackId) return;
          if (cached) {
            await playCachedAudio(cached, messageId, playbackId);
            return;
          }
          await streamAndCacheAudio(messageId, trimmedText, spokenText, voiceRevision, abortController, playbackId);
        }
      } else {
        try {
          const voiceRevision = await getServerVoiceRevision(abortController.signal);
          const cacheKey = createTtsAudioCacheKey(spokenText, { ...TTS_REQUEST_OPTIONS, voiceRevision });
          const cached = await getCachedTtsAudio(cacheKey, messageId, spokenText);
          if (abortController.signal.aborted || playbackIdRef.current !== playbackId) return;
          if (cached) {
            await playCachedAudio(cached, messageId, playbackId);
            return;
          }
          await streamAndCacheAudio(messageId, trimmedText, spokenText, voiceRevision, abortController, playbackId);
        } catch (serverError) {
          if (abortController.signal.aborted || playbackIdRef.current !== playbackId || !clientSpeechSupported) {
            throw serverError;
          }
          clearGeneratedAudio();
          disposeFallbackAudio();
          await playBrowserSpeech(messageId, spokenText, playbackId);
        }
      }
    } catch (error) {
      if (abortController.signal.aborted) return;
      setState({
        activeMessageId: messageId,
        error: error instanceof Error ? error.message : 'Could not speak response.',
        status: 'error',
      });
    } finally {
      if (abortRef.current === abortController) abortRef.current = null;
    }
  }, [cleanup, clearGeneratedAudio, clientSpeechSupported, disposeFallbackAudio, playBrowserSpeech, playCachedAudio, preferClientSpeech, primeGeneratedAudioPlayback, streamAndCacheAudio]);

  const restart = useCallback(async (messageId: string, text: string, options?: TtsPlaybackToggleOptions) => {
    await startPlayback(messageId, text, options);
  }, [startPlayback]);

  const toggle = useCallback(async (messageId: string, text: string, options?: TtsPlaybackToggleOptions) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    const shouldRequestClientSpeech = options?.preferClientSpeech ?? preferClientSpeech;
    if (
      state.activeMessageId === messageId
      && requestedClientSpeechRef.current !== null
      && requestedClientSpeechRef.current !== shouldRequestClientSpeech
    ) {
      await startPlayback(messageId, trimmedText, options);
      return;
    }

    if (state.activeMessageId === messageId && state.status === 'playing') {
      const synth = getSpeechSynthesis();
      const context = audioContextRef.current;
      if (playbackModeRef.current === 'browser' && synth?.speaking) {
        synth.pause();
      } else if (context && context.state === 'running') {
        await context.suspend();
      } else {
        fallbackAudioRef.current?.pause();
      }
      const pausedState = { activeMessageId: messageId, error: null, status: 'paused' as const };
      stateRef.current = pausedState;
      setState(pausedState);
      return;
    }

    if (state.activeMessageId === messageId && state.status === 'loading') {
      cleanup(true);
      return;
    }

    if (state.activeMessageId === messageId && state.status === 'paused') {
      try {
        const synth = getSpeechSynthesis();
        const context = audioContextRef.current;
        if (playbackModeRef.current === 'browser' && synth?.paused) {
          synth.resume();
        } else if (context && context.state === 'suspended') {
          await context.resume();
        } else {
          await fallbackAudioRef.current?.play();
        }
        setState({ activeMessageId: messageId, error: null, status: 'playing' });
      } catch {
        setState({ activeMessageId: messageId, error: 'Could not resume spoken response.', status: 'error' });
      }
      return;
    }

    await startPlayback(messageId, trimmedText, options);
  }, [cleanup, preferClientSpeech, startPlayback, state.activeMessageId, state.status]);

  useEffect(() => () => {
    cleanup(false);
  }, [cleanup]);

  return {
    ...state,
    clientSpeechSupported,
    playbackSpeed,
    restart,
    setPlaybackSpeed,
    stop,
    toggle,
  };
}
