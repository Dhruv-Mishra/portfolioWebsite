"use client";

import { useCallback, useSyncExternalStore } from 'react';

export interface VoiceAgentPrefs {
  lowNetwork: boolean;
}

const STORAGE_KEY = 'voice-agent-pref';
const EVENT_NAME = 'voice-agent-pref:change';
const DEFAULT_PREFS: VoiceAgentPrefs = {
  lowNetwork: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseVoiceAgentPrefs(raw: string | null): VoiceAgentPrefs {
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULT_PREFS };
    return {
      lowNetwork: parsed.lowNetwork === true,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function prefsEqual(a: VoiceAgentPrefs, b: VoiceAgentPrefs): boolean {
  return a.lowNetwork === b.lowNetwork;
}

function readFromStorage(): VoiceAgentPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFS };
  try {
    return parseVoiceAgentPrefs(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function writeToStorage(next: VoiceAgentPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

let state: VoiceAgentPrefs = DEFAULT_PREFS;
let initialized = false;
let storageListenerAttached = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENT_NAME));
  }
}

function adoptPrefs(next: VoiceAgentPrefs): boolean {
  if (prefsEqual(state, next)) return false;
  state = next;
  return true;
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY) return;
  if (adoptPrefs(parseVoiceAgentPrefs(event.newValue))) emit();
}

function attachStorageListener(): void {
  if (
    storageListenerAttached
    || typeof window === 'undefined'
    || typeof window.addEventListener !== 'function'
  ) return;
  window.addEventListener('storage', handleStorageEvent);
  storageListenerAttached = true;
}

function initOnce(): void {
  if (initialized || typeof window === 'undefined') return;
  adoptPrefs(readFromStorage());
  initialized = true;
  attachStorageListener();
}

function subscribe(listener: () => void): () => void {
  initOnce();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): VoiceAgentPrefs {
  initOnce();
  return state;
}

function getServerSnapshot(): VoiceAgentPrefs {
  return DEFAULT_PREFS;
}

export function setVoiceAgentPref<K extends keyof VoiceAgentPrefs>(
  key: K,
  value: VoiceAgentPrefs[K],
): void {
  initOnce();
  if (state[key] === value) {
    writeToStorage(state);
    return;
  }
  const next: VoiceAgentPrefs = { ...state, [key]: value };
  state = next;
  writeToStorage(next);
  emit();
}

export function getVoiceAgentPrefsSnapshot(): VoiceAgentPrefs {
  return getSnapshot();
}

export function useVoiceAgentPrefs(): {
  prefs: VoiceAgentPrefs;
  setPref: <K extends keyof VoiceAgentPrefs>(key: K, value: VoiceAgentPrefs[K]) => void;
} {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setPref = useCallback(<K extends keyof VoiceAgentPrefs>(key: K, value: VoiceAgentPrefs[K]) => {
    setVoiceAgentPref(key, value);
  }, []);
  return { prefs, setPref };
}
