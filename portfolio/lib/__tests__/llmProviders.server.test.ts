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
      model: 'deepseek-ai/deepseek-v4-flash-0731',
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
      primary: expect.objectContaining({
        kind: 'groq',
        model: 'qwen/qwen3.6-27b',
        modelId: 'qwen-3.6-27b',
        supportsImages: true,
        imageInputOrder: 'text-first',
      }),
      fallbacks: [],
    });
    const minimaxProviders = getChatProviders('minimax-m3');
    expect(minimaxProviders).toMatchObject({
      fallbacks: [],
      primary: {
        kind: 'nvidia',
        model: 'minimaxai/minimax-m3',
        modelId: 'minimax-m3',
        supportsImages: true,
        imageInputOrder: 'text-first',
      },
    });
    expect(minimaxProviders.primary?.sampling.extraBody).toEqual({
      chat_template_kwargs: { thinking_mode: 'disabled' },
    });

    expect(getChatProviders('inkling').primary).toMatchObject({
      supportsImages: true,
      imageInputOrder: 'text-first',
    });
    expect(getChatProviders('diffusiongemma-26b').primary).toMatchObject({
      supportsImages: true,
      imageInputOrder: 'image-first',
      acceptsSystemMessages: false,
    });
    expect(getChatProviders('glm-5.2').primary).toMatchObject({
      supportsImages: false,
    });
    expect(getChatProviders('glm-5.2').primary).not.toHaveProperty('imageInputOrder');

    expect(getChatProviders('gemma-4-31b-it').primary).toMatchObject({
      kind: 'nvidia',
      model: 'google/gemma-4-31b-it',
      supportsImages: true,
      imageInputOrder: 'text-first',
    });
    expect(getChatProviders('nemotron-3-super-120b-a12b').primary).toMatchObject({
      kind: 'nvidia',
      model: 'nvidia/nemotron-3-super-120b-a12b',
      supportsImages: false,
    });
    expect(getChatProviders('gpt-oss-120b').primary).toMatchObject({
      kind: 'nvidia',
      model: 'openai/gpt-oss-120b',
      supportsImages: false,
    });
  });

  it('returns no online chat provider when the selected model key is unavailable', () => {
    vi.stubEnv('NVIDIA_API_KEY', '');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');

    expect(getChatProviders('glm-5.2')).toEqual({ primary: null, fallbacks: [] });
  });

  it.each([
    ['https://llm.whoisdhruv.com', 'https://llm.whoisdhruv.com/v1'],
    ['https://llm.whoisdhruv.com/v1/', 'https://llm.whoisdhruv.com/v1'],
    ['https://llm.whoisdhruv.com/llm?discard=true#fragment', 'https://llm.whoisdhruv.com/llm/v1'],
    ['https://llm.whoisdhruv.com/llm/v1', 'https://llm.whoisdhruv.com/llm/v1'],
  ])('uses the local Gemma agent with canonical base URL %s', (configuredBaseUrl, baseURL) => {
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('NVIDIA_API_KEY', 'nvidia-key');
    vi.stubEnv('LOCAL_AGENT_BASE_URL', configuredBaseUrl);
    vi.stubEnv('LOCAL_AGENT_API_KEY', 'local-agent-key');

    expect(getChatProviders('qwen-3.5-4b-local')).toEqual({
      primary: {
        kind: 'openai',
        apiKey: 'local-agent-key',
        baseURL,
        model: 'gemma-4-e2b-phone',
        modelId: 'qwen-3.5-4b-local',
        label: 'Local agent',
        supportsImages: false,
        sampling: {
          temperature: 0.7,
          topP: 0.8,
          maxTokens: 512,
          extraBody: { chat_template_kwargs: { enable_thinking: false } },
        },
      },
      fallbacks: [],
    });
  });

  it.each([
    'ftp://llm.whoisdhruv.com',
    'https://local-agent-key@llm.whoisdhruv.com',
    'not a URL',
    `https://llm.whoisdhruv.com/${'a'.repeat(2_048)}`,
  ])('returns the static local fallback without throwing for invalid local base URL %s', (configuredBaseUrl) => {
    vi.stubEnv('LOCAL_AGENT_BASE_URL', configuredBaseUrl);
    vi.stubEnv('LOCAL_AGENT_API_KEY', 'local-agent-key');

    expect(() => getChatProviders('qwen-3.5-4b-local')).not.toThrow();
    expect(getChatProviders('qwen-3.5-4b-local')).toEqual({ primary: null, fallbacks: [] });
  });

  it('uses the static local reply when either local agent variable is unavailable', () => {
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('NVIDIA_API_KEY', 'nvidia-key');
    vi.stubEnv('LOCAL_AGENT_BASE_URL', 'https://llm.whoisdhruv.com/v1');
    vi.stubEnv('LOCAL_AGENT_API_KEY', '');

    expect(getChatProviders('qwen-3.5-4b-local')).toEqual({ primary: null, fallbacks: [] });

    vi.stubEnv('LOCAL_AGENT_API_KEY', 'local-agent-key');
    vi.stubEnv('LOCAL_AGENT_BASE_URL', '');

    expect(getChatProviders('qwen-3.5-4b-local')).toEqual({ primary: null, fallbacks: [] });
  });
});