import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveVoiceBackend } from '@/hooks/useVoiceInput';
import { resolveVoiceAgentApiKey } from '@/lib/voiceAgentConfig';

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
});

describe('voice API key isolation', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['https://staging.whoisdhruv.com', '', 'staged', 'production', 'unified', 'staged'],
    ['', 'staging', 'staged', 'production', 'unified', 'staged'],
    ['', 'staging', '', 'production', 'unified', 'unified'],
    ['', 'staging', '', 'production', '', null],
    ['https://whoisdhruv.com', '', 'staged', 'production', 'unified', 'production'],
    ['', 'production', 'staged', 'production', 'unified', 'production'],
    ['', 'production', 'staged', '', 'unified', 'unified'],
    ['', 'production', 'staged', '', '', null],
    ['http://localhost:3000', '', 'staged', 'production', 'unified', 'unified'],
    ['', 'development', 'staged', 'production', '', 'staged'],
    ['', '', '', 'production', '', null],
    ['', '', '', '', '', null],
    ['', 'staging', '  ', 'production', ' unified ', 'unified'],
  ])('resolves isolated keys for site=%s environment=%s', (site, environment, staging, production, unified, expected) => {
    vi.stubEnv('SITE_URL', site!);
    vi.stubEnv('MODEL_HEALTH_ENVIRONMENT', environment!);
    vi.stubEnv('STAGING_VOICE_AGENT_API_KEY', staging!);
    vi.stubEnv('PRODUCTION_VOICE_AGENT_API_KEY', production!);
    vi.stubEnv('VOICE_AGENT_API_KEY', unified!);

    expect(resolveVoiceAgentApiKey()).toBe(expected);
  });
});
