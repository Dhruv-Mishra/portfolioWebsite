import { describe, expect, it } from 'vitest';

import {
  getVoiceAgentPrefsSnapshot,
  setVoiceAgentPref,
} from '@/lib/voiceAgentPrefs';

describe('voiceAgentPrefs snapshot identity', () => {
  it('returns a referentially stable snapshot until values change', () => {
    const first = getVoiceAgentPrefsSnapshot();
    const second = getVoiceAgentPrefsSnapshot();
    expect(Object.is(first, second)).toBe(true);
  });

  it('allocates a new snapshot when a pref is toggled', () => {
    const before = getVoiceAgentPrefsSnapshot();
    const nextLowNetwork = !before.lowNetwork;
    setVoiceAgentPref('lowNetwork', nextLowNetwork);
    const after = getVoiceAgentPrefsSnapshot();
    expect(Object.is(before, after)).toBe(false);
    expect(after.lowNetwork).toBe(nextLowNetwork);
    expect(after.ambientMusic).toBe(before.ambientMusic);
  });
});
