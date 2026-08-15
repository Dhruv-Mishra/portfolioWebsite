"use client";

import { useCallback, useSyncExternalStore } from 'react';

export type VoiceOutputPref = 'device' | 'server';

const STORAGE_KEY = 'voice-output-pref';
const EVENT_NAME = 'voice-output-pref:change';
const DEFAULT_PREF: VoiceOutputPref = 'server';

function readPref(): VoiceOutputPref {
  if (typeof window === 'undefined') return DEFAULT_PREF;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'device' ? 'device' : DEFAULT_PREF;
  } catch {
    return DEFAULT_PREF;
  }
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(EVENT_NAME, onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener(EVENT_NAME, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

export function setVoiceOutputPref(next: VoiceOutputPref): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch { /* no-op */ }
  try {
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch { /* no-op */ }
}

export function useVoiceOutputPref(): {
  pref: VoiceOutputPref;
  setPref: (next: VoiceOutputPref) => void;
} {
  const pref = useSyncExternalStore<VoiceOutputPref>(subscribe, readPref, () => DEFAULT_PREF);

  const setPref = useCallback((next: VoiceOutputPref) => {
    setVoiceOutputPref(next);
  }, []);

  return { pref, setPref };
}