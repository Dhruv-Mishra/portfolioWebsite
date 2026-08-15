import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.join(process.cwd(), 'lib', 'voiceOutputPref.ts'),
  'utf8',
);
const playbackSource = fs.readFileSync(
  path.join(process.cwd(), 'hooks', 'useTtsPlayback.ts'),
  'utf8',
);

describe('voice output preference contract', () => {
  it('uses server speech at 1x as the SSR and missing-storage default', () => {
    expect(source).toContain("export type VoiceOutputPref = 'device' | 'server'");
    expect(source).toContain("const DEFAULT_PREF: VoiceOutputPref = 'server'");
    expect(source).toContain("useSyncExternalStore<VoiceOutputPref>(subscribe, readPref, () => DEFAULT_PREF)");
    expect(playbackSource).toContain('const DEFAULT_PLAYBACK_SPEED: TtsPlaybackSpeed = 1;');
  });

  it('preserves an explicit device selection and synchronizes preference events', () => {
    expect(source).toContain("window.localStorage.getItem(STORAGE_KEY) === 'device' ? 'device' : DEFAULT_PREF");
    expect(source).toContain('export function setVoiceOutputPref');
    expect(source).toContain('window.localStorage.setItem(STORAGE_KEY, next)');
    expect(source).toContain('window.dispatchEvent(new Event(EVENT_NAME))');
    expect(source).toContain("window.addEventListener('storage', onStoreChange)");
  });
});