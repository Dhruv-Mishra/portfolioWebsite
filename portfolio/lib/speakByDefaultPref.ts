"use client";

import { useCallback, useSyncExternalStore } from 'react';

export const SPEAK_BY_DEFAULT_STORAGE_KEY = 'speak-by-default-pref';
const EVENT_NAME = 'speak-by-default-pref:change';
const ENABLED_VALUE = 'enabled';

export function readSpeakByDefaultPref(raw: string | null): boolean {
  return raw === ENABLED_VALUE;
}

function readPref(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return readSpeakByDefaultPref(window.localStorage.getItem(SPEAK_BY_DEFAULT_STORAGE_KEY));
  } catch {
    return false;
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

export function useSpeakByDefaultPref(): {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
} {
  const enabled = useSyncExternalStore(subscribe, readPref, () => false);
  const setEnabled = useCallback((nextEnabled: boolean) => {
    try {
      if (nextEnabled) window.localStorage.setItem(SPEAK_BY_DEFAULT_STORAGE_KEY, ENABLED_VALUE);
      else window.localStorage.removeItem(SPEAK_BY_DEFAULT_STORAGE_KEY);
    } catch { /* no-op */ }
    try {
      window.dispatchEvent(new Event(EVENT_NAME));
    } catch { /* no-op */ }
  }, []);

  return { enabled, setEnabled };
}