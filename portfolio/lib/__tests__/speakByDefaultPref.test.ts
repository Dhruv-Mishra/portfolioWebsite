import { describe, expect, it } from 'vitest';
import { readSpeakByDefaultPref } from '@/lib/speakByDefaultPref';

describe('speak by default preference', () => {
  it('defaults off and enables only the explicit persisted value', () => {
    expect(readSpeakByDefaultPref(null)).toBe(false);
    expect(readSpeakByDefaultPref('')).toBe(false);
    expect(readSpeakByDefaultPref('true')).toBe(false);
    expect(readSpeakByDefaultPref('enabled')).toBe(true);
  });
});