"use client";

import { useCallback, useSyncExternalStore } from 'react';

export interface VoiceAgentPrefs {
  lowNetwork: boolean;
  ambientMusic: boolean;
}

const STORAGE_KEY = 'voice-agent-pref';
const EVENT_NAME = 'voice-agent-pref:change';
const DEFAULT_PREFS: VoiceAgentPrefs = {
  lowNetwork: false,
  ambientMusic: true,
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
      ambientMusic: parsed.ambientMusic !== false,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function readPrefs(): VoiceAgentPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFS };
  try {
    return parseVoiceAgentPrefs(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...DEFAULT_PREFS };
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

export function setVoiceAgentPref<K extends keyof VoiceAgentPrefs>(
  key: K,
  value: VoiceAgentPrefs[K],
): void {
  if (typeof window === 'undefined') return;
  const next = { ...readPrefs(), [key]: value };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function getVoiceAgentPrefsSnapshot(): VoiceAgentPrefs {
  return readPrefs();
}

export function useVoiceAgentPrefs(): {
  prefs: VoiceAgentPrefs;
  setPref: <K extends keyof VoiceAgentPrefs>(key: K, value: VoiceAgentPrefs[K]) => void;
} {
  const prefs = useSyncExternalStore(subscribe, readPrefs, () => DEFAULT_PREFS);
  const setPref = useCallback(<K extends keyof VoiceAgentPrefs>(key: K, value: VoiceAgentPrefs[K]) => {
    setVoiceAgentPref(key, value);
  }, []);
  return { prefs, setPref };
}
