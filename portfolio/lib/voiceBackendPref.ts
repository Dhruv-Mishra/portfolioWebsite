"use client";

import { useCallback } from 'react';
import { LocalPreference, usePreference } from '@/lib/localPreference';

export type VoiceBackendPref = 'native' | 'whisper';

// Default 'native' is instant; 'whisper' loads Transformers.js on the next mic tap, never before.
const voiceBackendPreference = new LocalPreference<VoiceBackendPref>(
  'voice-backend-pref',
  (raw) => (raw === 'whisper' ? 'whisper' : 'native'),
);

export const setVoiceBackendPref = voiceBackendPreference.set;

export function useVoiceBackendPref(): {
  pref: VoiceBackendPref;
  setPref: (next: VoiceBackendPref) => void;
  togglePref: () => void;
} {
  const pref = usePreference(voiceBackendPreference);
  const togglePref = useCallback(() => {
    setVoiceBackendPref(pref === 'whisper' ? 'native' : 'whisper');
  }, [pref]);

  return { pref, setPref: setVoiceBackendPref, togglePref };
}
