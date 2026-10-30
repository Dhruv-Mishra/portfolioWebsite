import { afterEach, describe, expect, it, vi } from 'vitest';

import { CHAT_MODELS } from '@/lib/chatModels';
import { getChatModelRuntimeCatalog, getChatProviders, getSuggestionsProviders } from '@/lib/llmProviders.server';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getSuggestionsProviders', () => {
  it('allocates at least 512 output tokens to every configured chat response, including suggestions', () => {
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('NVIDIA_API_KEY', 'nvidia-key');
    vi.stubEnv('LOCAL_AGENT_BASE_URL', 'https://llm.example/v1');
    vi.stubEnv('LOCAL_AGENT_API_KEY', 'local-agent-key');

    for (const model of CHAT_MODELS) {
      if (model.provider === 'browser') {
        expect(getChatProviders(model.id)).toEqual({ primary: null, fallbacks: [] });
        continue;
      }
      const provider = getChatProviders(model.id).primary;
      const outputLimit = provider?.sampling.maxCompletionTokens ?? provider?.sampling.maxTokens;

      expect(provider).not.toBeNull();
      expect(outputLimit).toBeGreaterThanOrEqual(512);
    }

    expect(getSuggestionsProviders().primary?.sampling.maxTokens).toBeGreaterThanOrEqual(512);
  });

  it('reports one deployment canary for each configured provider family', () => {
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('NVIDIA_API_KEY', 'nvidia-key');
    vi.stubEnv('LOCAL_AGENT_BASE_URL', 'https://llm.example/v1');
    vi.stubEnv('LOCAL_AGENT_API_KEY', 'local-agent-key');

    expect(getChatModelRuntimeCatalog()).toEqual({
      models: [
        { id: 'qwen-3.8-27b', provider: 'groq', available: true },
        { id: 'minimax-m3.1-flash', provider: 'nvidia', available: true },
        { id: 'deepseek-v4.1-flash', provider: 'nvidia', available: true },
        { id: 'nemotron-3.5-super-vl-120b-a12b', provider: 'nvidia', available: true },
        { id: 'qwen-3.5-4b-local', provider: 'local', available: true },
        { id: 'lfm3-omni-local', provider: 'local', available: true },
      ],
      deploymentCanaryModelIds: ['qwen-3.8-27b', 'minimax-m3.1-flash', 'qwen-3.5-4b-local'],
    });
  });

  it('uses only NVIDIA DeepSeek Flash for suggestions when every provider key is configured', () => {
    vi.stubEnv('NVIDIA_API_KEY', 'nvidia-key');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('LLM_API_KEY', 'legacy-key');
    vi.stubEnv('LLM_BASE_URL', 'https://legacy.example/v1');
    vi.stubEnv('LLM_MODEL', 'legacy-chat-model');

    const providers = getSuggestionsProviders();

    expect(providers.primary).toMatchObject({
      kind: 'nvidia',
      model: 'deepseek-ai/deepseek-v4.1-flash',
      sampling: { maxTokens: 512, extraBody: { chat_template_kwargs: { thinking: false } } },
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
        model: 'qwen/qwen3.8-27b',
        modelId: 'qwen-3.8-27b',
        supportsImages: true,
        imageInputOrder: 'text-first',
      }),
      fallbacks: [],
    });
    const minimaxProviders = getChatProviders('minimax-m3.1-flash');
    expect(minimaxProviders).toMatchObject({
      fallbacks: [],
      primary: {
        kind: 'nvidia',
        model: 'minimaxai/minimax-m3.1-flash',
        modelId: 'minimax-m3.1-flash',
        supportsImages: true,
        imageInputOrder: 'text-first',
      },
    });
    expect(minimaxProviders.primary?.sampling.extraBody).toEqual({
      chat_template_kwargs: { reasoning_effort: 'low' },
    });

    expect(getChatProviders('deepseek-v4.1-flash').primary).toMatchObject({
      model: 'deepseek-ai/deepseek-v4.1-flash',
      supportsImages: true,
      imageInputOrder: 'text-first',
      sampling: { maxTokens: 512, extraBody: { chat_template_kwargs: { thinking: false } } },
    });

    expect(getChatProviders('nemotron-3.5-super-vl-120b-a12b').primary).toMatchObject({
      kind: 'nvidia',
      model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
      supportsImages: true,
      sampling: { maxTokens: 2048, extraBody: { chat_template_kwargs: { enable_thinking: true } } },
    });
  });

  it('returns no online chat provider when the selected model key is unavailable', () => {
    vi.stubEnv('NVIDIA_API_KEY', '');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');

    expect(getChatProviders('nemotron-3.5-super-vl-120b-a12b')).toEqual({ primary: null, fallbacks: [] });
  });

  it.each([
    ['https://llm.whoisdhruv.com', 'https://llm.whoisdhruv.com/v1'],
    ['https://llm.whoisdhruv.com/v1/', 'https://llm.whoisdhruv.com/v1'],
    ['https://llm.whoisdhruv.com/llm?discard=true#fragment', 'https://llm.whoisdhruv.com/llm/v1'],
    ['https://llm.whoisdhruv.com/llm/v1', 'https://llm.whoisdhruv.com/llm/v1'],
  ])('uses the local Qwen3.5 agent with canonical base URL %s', (configuredBaseUrl, baseURL) => {
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('NVIDIA_API_KEY', 'nvidia-key');
    vi.stubEnv('LOCAL_AGENT_BASE_URL', configuredBaseUrl);
    vi.stubEnv('LOCAL_AGENT_API_KEY', 'local-agent-key');

    expect(getChatProviders('qwen-3.5-4b-local')).toEqual({
      primary: {
        kind: 'openai',
        apiKey: 'local-agent-key',
        baseURL,
        model: 'Qwen3.5-4B',
        modelId: 'qwen-3.5-4b-local',
        label: 'local:Qwen3.5-4B',
        supportsImages: false,
        sampling: {
          temperature: 0.3,
          topP: 0.8,
          maxTokens: 512,
          extraBody: {
            top_k: 20,
            chat_template_kwargs: { enable_thinking: false },
          },
        },
      },
      fallbacks: [],
    });
  });

  it('routes the omni model through the same local gateway with greedy vision sampling', () => {
    vi.stubEnv('LOCAL_AGENT_BASE_URL', 'https://llm.whoisdhruv.com');
    vi.stubEnv('LOCAL_AGENT_API_KEY', 'local-agent-key');

    expect(getChatProviders('lfm3-omni-local')).toEqual({
      primary: {
        kind: 'openai',
        apiKey: 'local-agent-key',
        baseURL: 'https://llm.whoisdhruv.com/v1',
        model: 'LFM3-Omni-2B',
        modelId: 'lfm3-omni-local',
        label: 'local:LFM3-Omni-2B',
        supportsImages: true,
        imageInputOrder: 'image-first',
        sampling: {
          temperature: 0,
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