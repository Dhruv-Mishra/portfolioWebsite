"use client";

import { LocalPreference, usePreference } from '@/lib/localPreference';

export const SPEAK_BY_DEFAULT_STORAGE_KEY = 'speak-by-default-pref';
const ENABLED_VALUE = 'enabled';

export function readSpeakByDefaultPref(raw: string | null): boolean {
  return raw === ENABLED_VALUE;
}

const speakByDefaultPreference = new LocalPreference<boolean>(
  SPEAK_BY_DEFAULT_STORAGE_KEY,
  readSpeakByDefaultPref,
  (enabled) => (enabled ? ENABLED_VALUE : null),
);

export const setSpeakByDefaultPref = speakByDefaultPreference.set;

export function useSpeakByDefaultPref(): {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
} {
  return { enabled: usePreference(speakByDefaultPreference), setEnabled: setSpeakByDefaultPref };
}