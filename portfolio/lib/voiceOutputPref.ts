"use client";

import { LocalPreference, usePreference } from '@/lib/localPreference';

export type VoiceOutputPref = 'device' | 'server';

const voiceOutputPreference = new LocalPreference<VoiceOutputPref>(
  'voice-output-pref',
  (raw) => (raw === 'device' ? 'device' : 'server'),
);

export const setVoiceOutputPref = voiceOutputPreference.set;

export function useVoiceOutputPref(): {
  pref: VoiceOutputPref;
  setPref: (next: VoiceOutputPref) => void;
} {
  return { pref: usePreference(voiceOutputPreference), setPref: setVoiceOutputPref };
}