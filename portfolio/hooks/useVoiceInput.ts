"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useSpeechRecognition,
  type UseSpeechRecognitionResult,
} from '@/hooks/useSpeechRecognition';
import {
  blobToWhisperAudio,
  logVoiceEvent,
  pickAudioMimeType,
  WHISPER_MODEL_ID,
} from '@/lib/whisperShared';

type WhisperWorkerClient = typeof import('@/lib/whisperWorkerClient');

let whisperWorkerClientPromise: Promise<WhisperWorkerClient> | null = null;

function loadWhisperWorkerClient(): Promise<WhisperWorkerClient> {
  whisperWorkerClientPromise ??= import('@/lib/whisperWorkerClient').catch((error) => {
    whisperWorkerClientPromise = null;
    throw error;
  });
  return whisperWorkerClientPromise;
}

/**
 * Whisper's transformers.js API expects the full lowercase language NAME
 * (e.g. 'english', 'hindi', 'spanish'), not a BCP-47 tag. Map the BCP-47
 * primary subtag to the canonical Whisper name. Returning `undefined`
 * lets the model auto-detect, which is the right default for users with
 * mixed-language speech or whose `navigator.language` doesn't match what
 * they're about to say.
 *
 * Only the most common languages are mapped — anything else falls through
 * to auto-detect rather than risk forcing the wrong language.
 */
const WHISPER_LANG_MAP: Readonly<Record<string, string>> = {
  en: 'english',
  hi: 'hindi',
  es: 'spanish',
  fr: 'french',
  de: 'german',
  it: 'italian',
  pt: 'portuguese',
  ru: 'russian',
  ja: 'japanese',
  ko: 'korean',
  zh: 'chinese',
  ar: 'arabic',
  bn: 'bengali',
  ta: 'tamil',
  te: 'telugu',
  mr: 'marathi',
  gu: 'gujarati',
  pa: 'punjabi',
  ur: 'urdu',
  tr: 'turkish',
  nl: 'dutch',
  pl: 'polish',
  sv: 'swedish',
  vi: 'vietnamese',
  th: 'thai',
  id: 'indonesian',
};

function resolveWhisperLanguage(explicit?: string): string | undefined {
  const raw = explicit ?? (typeof navigator !== 'undefined' ? navigator.language : undefined);
  if (!raw) return undefined;
  const primary = raw.toLowerCase().split('-')[0];
  return WHISPER_LANG_MAP[primary];
}

export type VoiceBackend = 'auto' | 'whisper' | 'native';
export type ResolvedBackend = 'whisper' | 'native' | null;

export interface UseVoiceInputOptions {
  /**
   * `native` (default) uses the Web Speech API for an instant, zero-download
   * experience — best mobile UX. `whisper` opts into the Transformers.js
   * Whisper pipeline (one-time ~35MB download, cached in IndexedDB after).
   * `auto` is legacy: starts on native and transparently upgrades to
   * Whisper once the model has finished a background preload.
   */
  backend?: VoiceBackend;
  lang?: string;
}

export interface UseVoiceInputResult {
  isSupported: boolean;
  /** True while actively recording / listening. */
  isListening: boolean;
  /** True while the Whisper model is downloading on first use. */
  isLoading: boolean;
  /** True while Whisper is post-processing the recorded audio. */
  isTranscribing: boolean;
  /** Final committed transcript. */
  transcript: string;
  /** Native-only live partial. Empty string for the whisper backend. */
  interimTranscript: string;
  /** First-load model download progress (0-1) — only meaningful while `isLoading`. */
  loadProgress: number;
  error: string | null;
  /** Which backend is actually in use (resolved after first start). */
  backend: ResolvedBackend;
  /**
   * Live `AnalyserNode` while the whisper backend is recording. `null` for
   * the native backend (no MediaStream available) and when not listening.
   * Consumers can read frequency/time-domain data for waveform rendering.
   */
  analyser: AnalyserNode | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Unified voice-input hook with two backends:
 *  - `'whisper'` — Transformers.js Whisper (lazy-loaded; better quality, ~40MB first load)
 *  - `'native'`  — Web Speech API (instant, lower quality, browser-dependent)
 *
 * Defaults to `'native'` for an instant, zero-download experience.
 * Pass `backend='whisper'` to opt into the offline Whisper pipeline.
 */
export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputResult {
  const { backend = 'native', lang } = options;

  // Native backend (Web Speech API). Silence auto-stop is disabled — the
  // mic must be a clean user-controlled toggle.
  const native: UseSpeechRecognitionResult = useSpeechRecognition({ lang, silenceMs: 0 });

  // Whisper detection: needs MediaRecorder + getUserMedia.
  const [whisperFeasible, setWhisperFeasible] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ok =
      typeof window.MediaRecorder !== 'undefined' &&
      !!navigator?.mediaDevices?.getUserMedia &&
      typeof window.AudioContext !== 'undefined';
    setWhisperFeasible(ok);
  }, []);

  const wantsWhisper = backend === 'whisper' || (backend === 'auto' && whisperFeasible);

  // Background Whisper preload for `auto` mode. First session always uses
  // native (instant); once Whisper is cached, subsequent sessions prefer it.
  // We do NOT swap mid-session — the resolved backend is pinned per start().
  const [isWhisperReady, setIsWhisperReady] = useState(false);
  useEffect(() => {
    if (backend !== 'auto' || !whisperFeasible) return;
    let cancelled = false;
    // Defer preload to idle time so we never compete with critical render.
    const idle = (cb: () => void) => {
      const w = window as unknown as { requestIdleCallback?: (fn: () => void) => number };
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(cb);
      else window.setTimeout(cb, 1500);
    };
    idle(() => {
      if (cancelled) return;
      void loadWhisperWorkerClient()
        .then(({ preloadWhisperWorker }) => preloadWhisperWorker())
        .then((ok) => { if (!cancelled && ok) setIsWhisperReady(true); })
        .catch(() => { if (!cancelled) setIsWhisperReady(false); });
    });
    return () => { cancelled = true; };
  }, [backend, whisperFeasible]);

  // Whisper recording state.
  const [isWhisperListening, setIsWhisperListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [whisperTranscript, setWhisperTranscript] = useState('');
  const [whisperError, setWhisperError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [resolvedBackend, setResolvedBackend] = useState<ResolvedBackend>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // Parallel analyser stream for the NATIVE backend. Web Speech doesn't
  // expose its captured MediaStream, so we open a second silent capture
  // purely for waveform visualisation. Browsers reuse the existing mic
  // permission, so this does not trigger a second prompt.
  const nativeStreamRef = useRef<MediaStream | null>(null);
  const nativeAudioCtxRef = useRef<AudioContext | null>(null);
  const nativeSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nativeStartTokenRef = useRef(0);

  const teardownAnalyser = useCallback(() => {
    try { sourceNodeRef.current?.disconnect(); } catch { /* no-op */ }
    sourceNodeRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    try { nativeSourceRef.current?.disconnect(); } catch { /* no-op */ }
    nativeSourceRef.current = null;
    const nctx = nativeAudioCtxRef.current;
    nativeAudioCtxRef.current = null;
    setAnalyser(null);
    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => {});
    }
    if (nctx && nctx.state !== 'closed') {
      void nctx.close().catch(() => {});
    }
  }, []);

  const stopMediaTracks = useCallback(() => {
    teardownAnalyser();
    streamRef.current?.getTracks().forEach((t) => {
      try { t.stop(); } catch { /* no-op */ }
    });
    streamRef.current = null;
    nativeStreamRef.current?.getTracks().forEach((t) => {
      try { t.stop(); } catch { /* no-op */ }
    });
    nativeStreamRef.current = null;
  }, [teardownAnalyser]);

  // Spin up a parallel analyser for the native backend.
  const startNativeAnalyser = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!navigator?.mediaDevices?.getUserMedia) return;
    const AudioCtx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const token = ++nativeStartTokenRef.current;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return; // mic blocked / not available — fallback bars will render
    }
    if (token !== nativeStartTokenRef.current) {
      // Superseded by another start/stop while awaiting.
      stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* no-op */ } });
      return;
    }
    nativeStreamRef.current = stream;
    try {
      const actx = new AudioCtx();
      const src = actx.createMediaStreamSource(stream);
      const an = actx.createAnalyser();
      an.fftSize = 256;
      an.smoothingTimeConstant = 0.7;
      src.connect(an);
      nativeAudioCtxRef.current = actx;
      nativeSourceRef.current = src;
      setAnalyser(an);
    } catch {
      /* no-op — waveform is non-essential */
    }
  }, []);

  const startWhisper = useCallback(async () => {
    setWhisperError(null);
    setWhisperTranscript('');
    cancelledRef.current = false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setWhisperError(err instanceof Error ? err.message : 'mic-permission-denied');
      // Fall back to native if `auto`.
      if (backend === 'auto' && native.isSupported) {
        setResolvedBackend('native');
        native.start();
      }
      return;
    }
    streamRef.current = stream;

    // Wire an AnalyserNode for live waveform rendering. Best-effort —
    // failures here must not break the recording pipeline.
    try {
      const AudioCtx =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const actx = new AudioCtx();
        const src = actx.createMediaStreamSource(stream);
        const an = actx.createAnalyser();
        an.fftSize = 256;
        an.smoothingTimeConstant = 0.7;
        src.connect(an);
        audioCtxRef.current = actx;
        sourceNodeRef.current = src;
        setAnalyser(an);
      }
    } catch {
      /* no-op — waveform is non-essential */
    }

    const workerClientPromise = loadWhisperWorkerClient();

    // Kick off model load in parallel with the first chunks of recording.
    setIsLoading(true);
    workerClientPromise
      .then(({ preloadWhisperWorker }) => preloadWhisperWorker((p) => {
        if (typeof p.progress === 'number') setLoadProgress(p.progress / 100);
      }))
      .then((ok) => { setIsLoading(false); setLoadProgress(ok ? 1 : 0); })
      .catch(() => { setIsLoading(false); });

    const mimeType = pickAudioMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (err) {
      stopMediaTracks();
      setWhisperError(err instanceof Error ? err.message : 'recorder-init-failed');
      setIsLoading(false);
      return;
    }
    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      const wasCancelled = cancelledRef.current;
      stopMediaTracks();
      setIsWhisperListening(false);
      if (wasCancelled || chunksRef.current.length === 0) {
        setIsTranscribing(false);
        return;
      }
      setIsTranscribing(true);
      const tStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      try {
        const blob = new Blob(chunksRef.current, { type: mimeType || chunksRef.current[0].type });
        const audio = await blobToWhisperAudio(blob);
        if (cancelledRef.current) return;
        // Skip clips shorter than ~250ms — usually a misclick.
        if (audio.length < 4000) {
          setIsTranscribing(false);
          return;
        }
        const { transcribeWithWorker } = await workerClientPromise;
        const text = await transcribeWithWorker(audio, { language: resolveWhisperLanguage(lang) });
        if (cancelledRef.current) return;
        setWhisperTranscript(text.trim());
        const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - tStart);
        logVoiceEvent('transcription-complete', {
          model: WHISPER_MODEL_ID,
          durationMs: ms,
          audioSamples: audio.length,
          audioSeconds: +(audio.length / 16000).toFixed(2),
          chars: text.trim().length,
        });
      } catch (err) {
        if (cancelledRef.current) return;
        const message = err instanceof Error ? err.message : 'transcribe-failed';
        setWhisperError(message);
        logVoiceEvent('transcription-failed', { error: message });
      } finally {
        if (!cancelledRef.current) setIsTranscribing(false);
      }
    };

    recorderRef.current = recorder;
    try {
      recorder.start();
      setIsWhisperListening(true);
      setResolvedBackend('whisper');
    } catch (err) {
      stopMediaTracks();
      setWhisperError(err instanceof Error ? err.message : 'recorder-start-failed');
    }
  }, [backend, native, stopMediaTracks, lang]);

  const stopWhisper = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { /* no-op */ }
    } else {
      setIsWhisperListening(false);
      stopMediaTracks();
    }
  }, [stopMediaTracks]);

  const resetWhisper = useCallback(() => {
    cancelledRef.current = true;
    setWhisperTranscript('');
    setWhisperError(null);
    setIsTranscribing(false);
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { /* no-op */ }
    }
    stopMediaTracks();
    setIsWhisperListening(false);
  }, [stopMediaTracks]);

  // Cleanup on unmount.
  useEffect(() => () => {
    cancelledRef.current = true;
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { /* no-op */ }
    }
    stopMediaTracks();
  }, [stopMediaTracks]);

  // Tear down the parallel native analyser stream as soon as the native
  // recogniser ends (whether by user stop or browser auto-end). The
  // whisper backend manages its own teardown via `recorder.onstop`.
  useEffect(() => {
    if (resolvedBackend !== 'native') return;
    if (native.isListening) return;
    if (!nativeStreamRef.current && !nativeAudioCtxRef.current) return;
    nativeStartTokenRef.current++;
    stopMediaTracks();
  }, [resolvedBackend, native.isListening, stopMediaTracks]);

  // Public API — route to the active backend.
  // `auto` defaults to native for instant first-tap UX; only upgrades to
  // Whisper once the model has finished its background preload.
  const useNative =
    backend === 'native' ||
    !wantsWhisper ||
    (backend === 'auto' && !isWhisperReady);

  const start = useCallback(() => {
    if (useNative) {
      setResolvedBackend('native');
      native.start();
      void startNativeAnalyser();
    } else {
      void startWhisper();
    }
  }, [useNative, native, startWhisper, startNativeAnalyser]);

  const stop = useCallback(() => {
    if (resolvedBackend === 'whisper') stopWhisper();
    else {
      nativeStartTokenRef.current++;
      native.stop();
      stopMediaTracks();
    }
  }, [resolvedBackend, stopWhisper, native, stopMediaTracks]);

  const reset = useCallback(() => {
    if (resolvedBackend === 'whisper') resetWhisper();
    else {
      nativeStartTokenRef.current++;
      stopMediaTracks();
    }
    native.reset();
    setWhisperTranscript('');
    setWhisperError(null);
  }, [resolvedBackend, resetWhisper, native, stopMediaTracks]);

  if (resolvedBackend === 'whisper') {
    return {
      isSupported: true,
      isListening: isWhisperListening,
      isLoading,
      isTranscribing,
      transcript: whisperTranscript,
      interimTranscript: '',
      loadProgress,
      error: whisperError,
      backend: 'whisper',
      analyser,
      start, stop, reset,
    };
  }

  return {
    isSupported: useNative ? native.isSupported : (whisperFeasible || native.isSupported),
    isListening: native.isListening,
    isLoading: false,
    isTranscribing: false,
    transcript: native.transcript,
    interimTranscript: native.interimTranscript,
    loadProgress: 0,
    error: native.error || whisperError,
    backend: resolvedBackend,
    // Same `analyser` state is shared by both backends — populated by
    // either the whisper recorder pipeline or the native parallel stream.
    analyser,
    start, stop, reset,
  };
}
