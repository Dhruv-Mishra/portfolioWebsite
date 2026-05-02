"use client";

import { useEffect, useState, useCallback } from 'react';
import { preloadWhisperPipeline } from '@/lib/whisperClient';

export type VoiceBackendPref = 'native' | 'whisper';

const STORAGE_KEY = 'voice-backend-pref';
const EVENT_NAME = 'voice-backend-pref:change';

function readPref(): VoiceBackendPref {
  if (typeof window === 'undefined') return 'native';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'whisper' ? 'whisper' : 'native';
  } catch {
    return 'native';
  }
}

/**
 * React hook for the user's voice-backend preference.
 * Default is `'native'` (instant, no model download). Toggling to
 * `'whisper'` persists in localStorage and triggers a background preload
 * of the Transformers.js model so the next mic tap uses Whisper.
 */
export function useVoiceBackendPref(): {
  pref: VoiceBackendPref;
  setPref: (next: VoiceBackendPref) => void;
  togglePref: () => void;
} {
  const [pref, setPrefState] = useState<VoiceBackendPref>('native');

  // Hydrate from localStorage on mount, and listen for cross-component changes.
  useEffect(() => {
    setPrefState(readPref());
    const onChange = () => setPrefState(readPref());
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const setPref = useCallback((next: VoiceBackendPref) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch { /* no-op */ }
    setPrefState(next);
    try {
      window.dispatchEvent(new Event(EVENT_NAME));
    } catch { /* no-op */ }
    // Kick off background model preload when opting into Whisper.
    if (next === 'whisper') {
      void preloadWhisperPipeline();
    }
  }, []);

  const togglePref = useCallback(() => {
    setPref(pref === 'whisper' ? 'native' : 'whisper');
  }, [pref, setPref]);

  return { pref, setPref, togglePref };
}
