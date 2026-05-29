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

interface TtsPlaybackState {
  activeMessageId: string | null;
  error: string | null;
  status: TtsPlaybackStatus;
}

interface TtsStreamMessage {
  audioBase64?: string;
  codec?: string;
  message?: string;
  sampleRate?: number;
  type?: 'ready' | 'chunk' | 'done' | 'error';
}

interface UseTtsPlaybackResult extends TtsPlaybackState {
  stop: () => void;
  toggle: (messageId: string, text: string) => Promise<void>;
}

const INITIAL_STATE: TtsPlaybackState = {
  activeMessageId: null,
  error: null,
  status: 'idle',
};

const DEFAULT_CODEC = 'pcm_s16le';
const DEFAULT_SAMPLE_RATE = 24_000;
const SCHEDULE_AHEAD_SECONDS = 0.035;
const ALLOWED_TTS_VOICES = [
  'expr-voice-2-m',
  'expr-voice-2-f',
  'expr-voice-3-m',
  'expr-voice-3-f',
  'expr-voice-4-m',
  'expr-voice-4-f',
  'expr-voice-5-m',
  'expr-voice-5-f',
] as const;
const DEFAULT_TTS_SPEED = getClientTtsSpeed();
const DEFAULT_TTS_VOICE = getClientTtsVoice();
const TTS_REQUEST_OPTIONS = { speed: DEFAULT_TTS_SPEED, voice: DEFAULT_TTS_VOICE } as const;

function getClientTtsVoice(): string {
  const voice = process.env.NEXT_PUBLIC_TTS_VOICE;
  return voice && (ALLOWED_TTS_VOICES as readonly string[]).includes(voice) ? voice : 'expr-voice-5-m';
}

function getClientTtsSpeed(): number {
  const parsed = Number.parseFloat(process.env.NEXT_PUBLIC_TTS_SPEED ?? '1');
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(1.15, Math.max(0.85, parsed));
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function copyArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  const copy = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(copy).set(new Uint8Array(buffer));
  return copy;
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
  const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

export function useTtsPlayback(): UseTtsPlaybackResult {
  const [state, setState] = useState<TtsPlaybackState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const fallbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const fallbackObjectUrlRef = useRef<string | null>(null);
  const pendingSourcesRef = useRef(0);
  const playbackIdRef = useRef(0);
  const scheduledUntilRef = useRef(0);
  const sourceRefs = useRef<Set<AudioBufferSourceNode>>(new Set());
  const stateRef = useRef<TtsPlaybackState>(INITIAL_STATE);
  const streamDoneRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
    if (context && context.state !== 'closed') {
      void context.close().catch(() => {});
    }
    setState(INITIAL_STATE);
  }, []);

  const cleanup = useCallback((resetState: boolean) => {
    playbackIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
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
    if (context && context.state !== 'closed') {
      void context.close().catch(() => {});
    }

    const fallbackAudio = fallbackAudioRef.current;
    if (fallbackAudio) {
      fallbackAudio.pause();
      fallbackAudio.removeAttribute('src');
      fallbackAudio.load();
      fallbackAudioRef.current = null;
    }

    releaseFallbackObjectUrl();
    if (resetState) setState(INITIAL_STATE);
  }, [releaseFallbackObjectUrl]);

  const stop = useCallback(() => {
    cleanup(true);
  }, [cleanup]);

  const ensureAudioContext = useCallback(async (): Promise<AudioContext> => {
    let context = audioContextRef.current;
    if (!context || context.state === 'closed') {
      const AudioContextCtor = getAudioContextConstructor();
      if (!AudioContextCtor) {
        throw new Error('Audio playback is not supported in this browser.');
      }
      context = new AudioContextCtor({ sampleRate: DEFAULT_SAMPLE_RATE });
      audioContextRef.current = context;
      scheduledUntilRef.current = context.currentTime + SCHEDULE_AHEAD_SECONDS;
    }
    if (context.state === 'suspended') {
      await context.resume();
    }
    return context;
  }, []);

  const schedulePcmChunk = useCallback((buffer: ArrayBuffer, sampleRate: number, playbackId: number): void => {
    const context = audioContextRef.current;
    if (!context || playbackIdRef.current !== playbackId) return;

    const samples = decodePcm16(buffer);
    if (samples.length === 0) return;

    const audioBuffer = context.createBuffer(1, samples.length, sampleRate);
    audioBuffer.getChannelData(0).set(samples);
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);

    const startAt = Math.max(context.currentTime + SCHEDULE_AHEAD_SECONDS, scheduledUntilRef.current);
    scheduledUntilRef.current = startAt + audioBuffer.duration;
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

    streamDoneRef.current = false;
    for (const chunk of cached.chunks) {
      if (playbackIdRef.current !== playbackId) return;
      schedulePcmChunk(chunk, cached.sampleRate, playbackId);
    }

    streamDoneRef.current = true;
    if (cached.chunks.length > 0) {
      if (stateRef.current.status !== 'paused') {
        setState({ activeMessageId: messageId, error: null, status: 'playing' });
      }
    }
    finishPlaybackIfDone(playbackId);
  }, [ensureAudioContext, finishPlaybackIfDone, schedulePcmChunk]);

  const playWavFallback = useCallback(async (messageId: string, text: string, abortController: AbortController, playbackId: number) => {
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
    fallbackAudioRef.current = audio;

    audio.addEventListener('ended', () => {
      if (playbackIdRef.current !== playbackId || fallbackAudioRef.current !== audio) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      releaseFallbackObjectUrl();
      fallbackAudioRef.current = null;
      setState(INITIAL_STATE);
    }, { once: true });
    audio.addEventListener('error', () => {
      if (playbackIdRef.current !== playbackId || fallbackAudioRef.current !== audio) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      releaseFallbackObjectUrl();
      fallbackAudioRef.current = null;
      setState({ activeMessageId: messageId, error: 'Could not play spoken response.', status: 'error' });
    }, { once: true });

    await audio.play();
    if (playbackIdRef.current !== playbackId || fallbackAudioRef.current !== audio) return;
    setState({ activeMessageId: messageId, error: null, status: 'playing' });
  }, [releaseFallbackObjectUrl]);

  const streamAndCacheAudio = useCallback(async (
    messageId: string,
    requestText: string,
    spokenText: string,
    cacheKey: string,
    abortController: AbortController,
    playbackId: number,
  ) => {
    await ensureAudioContext();
    if (playbackIdRef.current !== playbackId) return;

    const response = await fetch('/api/tts', {
      body: JSON.stringify({ stream: true, text: requestText, ...TTS_REQUEST_OPTIONS }),
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/x-ndjson',
        'Content-Type': 'application/json',
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

    const handleLine = (line: string) => {
      if (!line.trim() || playbackIdRef.current !== playbackId) return;
      const message = JSON.parse(line) as TtsStreamMessage;
      if (message.type === 'ready') {
        codec = message.codec ?? codec;
        sampleRate = message.sampleRate ?? sampleRate;
        return;
      }
      if (message.type === 'error') {
        throw new Error(message.message ?? 'Local TTS streaming failed.');
      }
      if (message.type === 'done') {
        streamDoneRef.current = true;
        finishPlaybackIfDone(playbackId);
        return;
      }
      if (message.type !== 'chunk' || !message.audioBase64) return;

      const buffer = base64ToArrayBuffer(message.audioBase64);
      const chunkSampleRate = message.sampleRate ?? sampleRate;
      sampleRate = chunkSampleRate;
      byteLength += buffer.byteLength;
      cachedChunks.push(copyArrayBuffer(buffer));
      schedulePcmChunk(buffer, chunkSampleRate, playbackId);
      if (stateRef.current.status !== 'paused') {
        const playingState = { activeMessageId: messageId, error: null, status: 'playing' as const };
        stateRef.current = playingState;
        setState(playingState);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (abortController.signal.aborted || playbackIdRef.current !== playbackId) return;
      pending += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) handleLine(line);
      if (done) break;
    }

    if (pending.trim()) handleLine(pending);
    streamDoneRef.current = true;
    if (!abortController.signal.aborted && playbackIdRef.current === playbackId && cachedChunks.length > 0) {
      void putCachedTtsAudio({
        byteLength,
        cacheKey,
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

  const toggle = useCallback(async (messageId: string, text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    if (state.activeMessageId === messageId && state.status === 'playing') {
      const context = audioContextRef.current;
      if (context && context.state === 'running') {
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
        const context = audioContextRef.current;
        if (context && context.state === 'suspended') {
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

    cleanup(false);
    const abortController = new AbortController();
    abortRef.current = abortController;
    const playbackId = playbackIdRef.current;
    const spokenText = adaptTextForSpeech(trimmedText);
    if (!spokenText) {
      setState(INITIAL_STATE);
      return;
    }
    const cacheKey = createTtsAudioCacheKey(spokenText, TTS_REQUEST_OPTIONS);
    setState({ activeMessageId: messageId, error: null, status: 'loading' });

    try {
      await ensureAudioContext();
      if (abortController.signal.aborted || playbackIdRef.current !== playbackId) return;

      const cached = await getCachedTtsAudio(cacheKey, messageId, spokenText);
      if (abortController.signal.aborted || playbackIdRef.current !== playbackId) return;
      if (cached) {
        await playCachedAudio(cached, messageId, playbackId);
      } else {
        await streamAndCacheAudio(messageId, trimmedText, spokenText, cacheKey, abortController, playbackId);
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
  }, [cleanup, ensureAudioContext, playCachedAudio, state.activeMessageId, state.status, streamAndCacheAudio]);

  useEffect(() => () => {
    cleanup(false);
  }, [cleanup]);

  return {
    ...state,
    stop,
    toggle,
  };
}
