import { afterEach, describe, expect, it, vi } from 'vitest';

import { getSuggestionsProviders } from '@/lib/llmProviders.server';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getSuggestionsProviders', () => {
  it('uses Groq first with the suggestions model override and preserves a legacy fallback', () => {
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('GROQ_MODEL', 'groq-chat-model');
    vi.stubEnv('GROQ_SUGGESTIONS_MODEL', 'groq-suggestions-model');
    vi.stubEnv('LLM_API_KEY', 'legacy-key');
    vi.stubEnv('LLM_BASE_URL', 'https://legacy.example/v1');
    vi.stubEnv('LLM_MODEL', 'legacy-chat-model');
    vi.stubEnv('LLM_SUGGESTIONS_MODEL', 'legacy-suggestions-model');

    const providers = getSuggestionsProviders();

    expect(providers.primary).toMatchObject({
      kind: 'groq',
      model: 'groq-suggestions-model',
      label: 'groq:groq-suggestions-model',
    });
    expect(providers.fallback).toMatchObject({
      kind: 'openai',
      model: 'legacy-suggestions-model',
      label: 'legacy-suggestions-model',
    });
  });

  it('uses the normal Groq model when no suggestions override is configured', () => {
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('GROQ_MODEL', 'groq-chat-model');
    vi.stubEnv('GROQ_SUGGESTIONS_MODEL', '');
    vi.stubEnv('LLM_API_KEY', '');
    vi.stubEnv('LLM_BASE_URL', '');
    vi.stubEnv('LLM_MODEL', '');

    expect(getSuggestionsProviders()).toMatchObject({
      primary: { kind: 'groq', model: 'groq-chat-model' },
      fallback: null,
    });
  });
});