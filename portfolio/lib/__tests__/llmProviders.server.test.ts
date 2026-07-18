import { afterEach, describe, expect, it, vi } from 'vitest';

import { getChatProviders, getSuggestionsProviders } from '@/lib/llmProviders.server';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getSuggestionsProviders', () => {
  it('uses only NVIDIA DeepSeek Flash for suggestions when every provider key is configured', () => {
    vi.stubEnv('NVIDIA_API_KEY', 'nvidia-key');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('LLM_API_KEY', 'legacy-key');
    vi.stubEnv('LLM_BASE_URL', 'https://legacy.example/v1');
    vi.stubEnv('LLM_MODEL', 'legacy-chat-model');

    const providers = getSuggestionsProviders();

    expect(providers.primary).toMatchObject({
      kind: 'nvidia',
      model: 'deepseek-ai/deepseek-v4-flash',
      sampling: { maxTokens: 384, extraBody: { chat_template_kwargs: { thinking: false } } },
    });
    expect(providers.fallback).toBeNull();
    expect(providers.legacyFallback).toBeNull();
  });

  it('does not use Groq or legacy suggestions when NVIDIA is unavailable', () => {
    vi.stubEnv('NVIDIA_API_KEY', '');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('LLM_API_KEY', '');
    vi.stubEnv('LLM_BASE_URL', '');
    vi.stubEnv('LLM_MODEL', '');

    expect(getSuggestionsProviders()).toEqual({
      primary: null,
      fallback: null,
      legacyFallback: null,
    });
  });

  it('uses only the exact selected provider even when every key is configured', () => {
    vi.stubEnv('NVIDIA_API_KEY', 'nvidia-key');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('LLM_API_KEY', 'legacy-key');
    vi.stubEnv('LLM_BASE_URL', 'https://legacy.example/v1');
    vi.stubEnv('LLM_MODEL', 'legacy-chat-model');

    const defaultProviders = getChatProviders();
    expect(defaultProviders).toEqual({
      primary: expect.objectContaining({ kind: 'groq', model: 'qwen/qwen3.6-27b', modelId: 'qwen-3.6-27b' }),
      fallbacks: [],
    });
    const minimaxProviders = getChatProviders('minimax-m3');
    expect(minimaxProviders).toMatchObject({
      fallbacks: [],
      primary: {
      kind: 'nvidia',
      model: 'minimaxai/minimax-m3',
        modelId: 'minimax-m3',
      },
    });
    expect(minimaxProviders.primary?.sampling.extraBody).toEqual({
      chat_template_kwargs: { thinking_mode: 'disabled' },
    });
    const kimiProviders = getChatProviders('kimi-k2.6');
    expect(kimiProviders).toMatchObject({
      primary: {
        kind: 'nvidia',
        model: 'moonshotai/kimi-k2.6',
        modelId: 'kimi-k2.6',
        supportsImages: true,
      },
      fallbacks: [],
    });
    expect(kimiProviders.primary?.sampling.extraBody).toEqual({
      chat_template_kwargs: { thinking: false },
    });
  });

  it('returns no online chat provider when the selected model key is unavailable', () => {
    vi.stubEnv('NVIDIA_API_KEY', '');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');

    expect(getChatProviders('glm-5.2')).toEqual({ primary: null, fallbacks: [] });
  });
});