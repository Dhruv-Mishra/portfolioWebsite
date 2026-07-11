import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveVoiceBackend } from '@/hooks/useVoiceInput';

describe('voice backend resolution', () => {
  it('falls back from persisted Whisper to native when local APIs are infeasible', () => {
    expect(resolveVoiceBackend('whisper', {
      nativeSpeechSupported: true,
      whisperFeasible: false,
    })).toBe('native');
  });

  it('uses Whisper when requested and feasible, including native-less browsers', () => {
    expect(resolveVoiceBackend('whisper', {
      nativeSpeechSupported: true,
      whisperFeasible: true,
    })).toBe('whisper');
    expect(resolveVoiceBackend('native', {
      nativeSpeechSupported: false,
      whisperFeasible: true,
    })).toBe('whisper');
  });

  it('returns no backend only when neither implementation can run', () => {
    expect(resolveVoiceBackend('whisper', {
      nativeSpeechSupported: false,
      whisperFeasible: false,
    })).toBeNull();
  });

  it('keeps the Whisper worker lazy for an explicit persisted preference', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'hooks', 'useVoiceInput.ts'),
      'utf8',
    );

    expect(source).toContain("import('@/lib/whisperWorkerClient')");
    expect(source).toMatch(/if \(backend !== 'auto' \|\| !whisperFeasible\) return/);
    expect(source).toMatch(/preferredBackend === 'whisper'[\s\S]*?startWhisper\(\)/);
    expect(source).toMatch(/backend !== 'whisper'[\s\S]*?requiresLocalTranscription|requiresLocalTranscription:[\s\S]*?backend !== 'whisper'/);
  });
});