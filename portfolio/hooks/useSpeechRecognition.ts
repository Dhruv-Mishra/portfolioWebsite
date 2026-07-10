"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  formatMicrophoneError,
  getMicrophonePermissionState,
  microphoneAccessContext,
} from '@/lib/microphoneAccess';

// Minimal Web Speech API typings — vendor-prefixed and not in lib.dom for all targets.
interface SpeechRecognitionAlternative { transcript: string; confidence: number }
interface SpeechRecognitionResult { isFinal: boolean; 0: SpeechRecognitionAlternative; length: number }
interface SpeechRecognitionResultList { length: number; [index: number]: SpeechRecognitionResult }
interface SpeechRecognitionEvent extends Event { resultIndex: number; results: SpeechRecognitionResultList }
interface SpeechRecognitionErrorEvent extends Event { error: string; message?: string }
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export interface UseSpeechRecognitionOptions {
  /** BCP-47 language tag. Defaults to browser locale. */
  lang?: string;
  /** Auto-stop after this many ms of silence. Set to `0` (default) to disable
   *  and require an explicit user stop — needed for a clean tap-to-toggle UX. */
  silenceMs?: number;
}

export interface UseSpeechRecognitionResult {
  isSupported: boolean;
  isListening: boolean;
  isRequestingPermission: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Web Speech API (STT) hook. Hydration-safe: support is detected in an effect.
 * Lazy-instantiates recognition, cleans up on unmount, auto-stops on silence.
 */
export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionResult {
  const { lang, silenceMs = 0 } = options;

  const isSupported = useSyncExternalStore(
    () => () => undefined,
    () => getCtor() !== null,
    () => false,
  );
  const [isListening, setIsListening] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalRef = useRef('');
  const lastInterimRef = useRef('');
  const manualStopRef = useRef(false);
  const requestIdRef = useRef(0);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    clearSilenceTimer();
    try { recognitionRef.current?.stop(); } catch { /* no-op */ }
  }, [clearSilenceTimer]);

  const armSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    if (silenceMs <= 0) return; // disabled — caller controls stop explicitly
    silenceTimerRef.current = setTimeout(() => { stop(); }, silenceMs);
  }, [clearSilenceTimer, silenceMs, stop]);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setError('Speech recognition is not supported in this browser.');
      return;
    }
    if (recognitionRef.current) return;

    setError(null);
    finalRef.current = '';
    lastInterimRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    manualStopRef.current = false;
    const requestId = ++requestIdRef.current;
    setIsRequestingPermission(true);

    const rec = new Ctor();
    rec.lang = lang || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      if (recognitionRef.current !== rec) return;
      setIsRequestingPermission(false);
      setIsListening(true);
      armSilenceTimer();
    };
    rec.onerror = (ev) => {
      if (recognitionRef.current !== rec) return;
      setIsRequestingPermission(false);
      // 'no-speech' / 'aborted' are benign; surface others.
      if (ev.error && ev.error !== 'no-speech' && ev.error !== 'aborted') {
        const recognitionError = { error: ev.error, message: ev.message };
        setError(formatMicrophoneError(recognitionError, microphoneAccessContext()));
        void getMicrophonePermissionState().then((permissionState) => {
          if (requestIdRef.current !== requestId) return;
          setError(formatMicrophoneError(
            recognitionError,
            microphoneAccessContext(permissionState),
          ));
        });
      }
    };
    rec.onend = () => {
      if (recognitionRef.current !== rec) return;
      clearSilenceTimer();
      setIsRequestingPermission(false);
      const fallbackTranscript = finalRef.current || (manualStopRef.current ? lastInterimRef.current.trim() : '');
      if (fallbackTranscript) setTranscript(fallbackTranscript);
      setIsListening(false);
      setInterimTranscript('');
      recognitionRef.current = null;
    };
    rec.onresult = (ev) => {
      if (recognitionRef.current !== rec) return;
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalRef.current = (finalRef.current + ' ' + text).replace(/\s+/g, ' ').trim();
        } else {
          interim += text;
        }
      }
      setTranscript(finalRef.current);
      lastInterimRef.current = interim;
      setInterimTranscript(interim);
      armSilenceTimer();
    };

    recognitionRef.current = rec;
    try { rec.start(); }
    catch (err) {
      setIsRequestingPermission(false);
      setError(formatMicrophoneError(err, microphoneAccessContext()));
      void getMicrophonePermissionState().then((permissionState) => {
        if (requestIdRef.current !== requestId) return;
        setError(formatMicrophoneError(err, microphoneAccessContext(permissionState)));
      });
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, [lang, armSilenceTimer, clearSilenceTimer]);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    clearSilenceTimer();
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try { recognition?.abort(); } catch { /* no-op */ }
    finalRef.current = '';
    lastInterimRef.current = '';
    setIsListening(false);
    setIsRequestingPermission(false);
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, [clearSilenceTimer]);

  // Cleanup on unmount.
  useEffect(() => () => {
    requestIdRef.current += 1;
    clearSilenceTimer();
    try { recognitionRef.current?.abort(); } catch { /* no-op */ }
    recognitionRef.current = null;
  }, [clearSilenceTimer]);

  return {
    isSupported,
    isListening,
    isRequestingPermission,
    transcript,
    interimTranscript,
    error,
    start,
    stop,
    reset,
  };
}
