import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.join(process.cwd(), 'lib', 'voiceOutputPref.ts'),
  'utf8',
);

describe('voice output preference contract', () => {
  it('uses device speech as the valid SSR and missing-storage default', () => {
    expect(source).toContain("export type VoiceOutputPref = 'device' | 'server'");
    expect(source).toContain("const DEFAULT_PREF: VoiceOutputPref = 'device'");
    expect(source).toContain("useSyncExternalStore<VoiceOutputPref>(subscribe, readPref, () => DEFAULT_PREF)");
  });

  it('persists explicit server selection and synchronizes same-tab and storage events', () => {
    expect(source).toContain("window.localStorage.getItem(STORAGE_KEY) === 'server' ? 'server' : DEFAULT_PREF");
    expect(source).toContain('window.localStorage.setItem(STORAGE_KEY, next)');
    expect(source).toContain('window.dispatchEvent(new Event(EVENT_NAME))');
    expect(source).toContain("window.addEventListener('storage', onStoreChange)");
  });
});