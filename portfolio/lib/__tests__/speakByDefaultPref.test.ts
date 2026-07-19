import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSpeakByDefaultPref } from '@/lib/speakByDefaultPref';

const settingsSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'SettingsPanel.tsx'),
  'utf8',
);

describe('speak by default preference', () => {
  it('defaults off and enables only the explicit persisted value', () => {
    expect(readSpeakByDefaultPref(null)).toBe(false);
    expect(readSpeakByDefaultPref('')).toBe(false);
    expect(readSpeakByDefaultPref('true')).toBe(false);
    expect(readSpeakByDefaultPref('enabled')).toBe(true);
  });

  it('is exposed as a persisted voice-output setting', () => {
    expect(settingsSource).toContain('label="Speak by default"');
    expect(settingsSource).toContain('checked={speakByDefault}');
    expect(settingsSource).toContain('onChange={setSpeakByDefault}');
  });
});