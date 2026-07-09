"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

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
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalRef = useRef('');
  const lastInterimRef = useRef('');
  const manualStopRef = useRef(false);

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
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* no-op */ }
    }

    setError(null);
    finalRef.current = '';
    lastInterimRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    manualStopRef.current = false;

    const rec = new Ctor();
    rec.lang = lang || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => { setIsListening(true); armSilenceTimer(); };
    rec.onerror = (ev) => {
      // 'no-speech' / 'aborted' are benign; surface others.
      if (ev.error && ev.error !== 'no-speech' && ev.error !== 'aborted') {
        setError(ev.error);
      }
    };
    rec.onend = () => {
      clearSilenceTimer();
      const fallbackTranscript = finalRef.current || (manualStopRef.current ? lastInterimRef.current.trim() : '');
      if (fallbackTranscript) setTranscript(fallbackTranscript);
      setIsListening(false);
      setInterimTranscript('');
      recognitionRef.current = null;
    };
    rec.onresult = (ev) => {
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
      setError(err instanceof Error ? err.message : 'failed to start');
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, [lang, armSilenceTimer, clearSilenceTimer]);

  const reset = useCallback(() => {
    finalRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  // Cleanup on unmount.
  useEffect(() => () => {
    clearSilenceTimer();
    try { recognitionRef.current?.abort(); } catch { /* no-op */ }
    recognitionRef.current = null;
  }, [clearSilenceTimer]);

  return { isSupported, isListening, transcript, interimTranscript, error, start, stop, reset };
}
