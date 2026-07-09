"use client";

import { useCallback, useSyncExternalStore } from 'react';

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
 * `'whisper'` persists in localStorage. The Transformers.js model is loaded
 * on the next mic tap so opting in never fetches the optional voice stack
 * before the user actually records.
 */
export function useVoiceBackendPref(): {
  pref: VoiceBackendPref;
  setPref: (next: VoiceBackendPref) => void;
  togglePref: () => void;
} {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const onChange = () => onStoreChange();
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  const pref = useSyncExternalStore<VoiceBackendPref>(subscribe, readPref, () => 'native');

  const setPref = useCallback((next: VoiceBackendPref) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch { /* no-op */ }
    try {
      window.dispatchEvent(new Event(EVENT_NAME));
    } catch { /* no-op */ }
  }, []);

  const togglePref = useCallback(() => {
    setPref(pref === 'whisper' ? 'native' : 'whisper');
  }, [pref, setPref]);

  return { pref, setPref, togglePref };
}
