import { afterEach, describe, expect, it, vi } from 'vitest';

import { getChatProviders, getSuggestionsProviders } from '@/lib/llmProviders.server';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getSuggestionsProviders', () => {
  it('prefers NVIDIA DeepSeek Flash, then allowlisted Groq Qwen, then legacy', () => {
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
    expect(providers.fallback).toMatchObject({
      kind: 'groq',
      model: 'qwen/qwen3.6-27b',
      sampling: { temperature: 0.6, topP: 0.95, maxCompletionTokens: 384, extraBody: { stop: ['\n\n\n', '\nUser:', '\nAssistant:'], reasoning_effort: 'none' } },
    });
    expect(providers.legacyFallback).toMatchObject({
      kind: 'openai',
      model: 'legacy-chat-model',
    });
  });

  it('uses allowlisted Groq Qwen when NVIDIA is unavailable', () => {
    vi.stubEnv('NVIDIA_API_KEY', '');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('LLM_API_KEY', '');
    vi.stubEnv('LLM_BASE_URL', '');
    vi.stubEnv('LLM_MODEL', '');

    expect(getSuggestionsProviders()).toMatchObject({
      primary: { kind: 'groq', model: 'qwen/qwen3.6-27b' },
      fallback: null,
    });
  });

  it('uses NVIDIA DiffusionGemma in the default chat chain and preserves exact selected NVIDIA models', () => {
    vi.stubEnv('NVIDIA_API_KEY', 'nvidia-key');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('LLM_API_KEY', 'legacy-key');
    vi.stubEnv('LLM_BASE_URL', 'https://legacy.example/v1');
    vi.stubEnv('LLM_MODEL', 'legacy-chat-model');

    const defaultProviders = getChatProviders();
    expect(defaultProviders).toMatchObject({
      primary: { kind: 'groq', model: 'qwen/qwen3.6-27b' },
      fallbacks: [
        { kind: 'nvidia', model: 'google/diffusiongemma-26b-a4b-it', supportsImages: true },
        { kind: 'openai', model: 'legacy-chat-model', supportsImages: false },
      ],
    });
    expect(defaultProviders.fallbacks[0]?.sampling.extraBody).toEqual({
      chat_template_kwargs: { enable_thinking: false },
    });
    expect(getChatProviders('minimax-m3').primary).toMatchObject({
      kind: 'nvidia',
      model: 'minimaxai/minimax-m3',
    });
    expect(getChatProviders('minimax-m3').primary?.sampling.extraBody).toEqual({
      chat_template_kwargs: { thinking_mode: 'disabled' },
    });
    expect(getChatProviders('kimi-k2.6')).toMatchObject({
      primary: {
        kind: 'nvidia',
        model: 'moonshotai/kimi-k2.6',
        supportsImages: true,
      },
      fallbacks: [
        { kind: 'groq', model: 'qwen/qwen3.6-27b', supportsImages: true },
        { kind: 'nvidia', model: 'google/diffusiongemma-26b-a4b-it', supportsImages: true },
        { kind: 'openai', model: 'legacy-chat-model', supportsImages: false },
      ],
    });
    expect(getChatProviders('kimi-k2.6').primary?.sampling.extraBody).toEqual({
      chat_template_kwargs: { thinking: false },
    });
  });

  it('keeps NVIDIA DiffusionGemma and legacy in the Kimi chain when Groq is unavailable', () => {
    vi.stubEnv('NVIDIA_API_KEY', 'nvidia-key');
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('LLM_API_KEY', 'legacy-key');
    vi.stubEnv('LLM_BASE_URL', 'https://legacy.example/v1');
    vi.stubEnv('LLM_MODEL', 'legacy-chat-model');

    expect(getChatProviders('kimi-k2.6')).toMatchObject({
      primary: { kind: 'nvidia', model: 'moonshotai/kimi-k2.6', supportsImages: true },
      fallbacks: [
        { kind: 'nvidia', model: 'google/diffusiongemma-26b-a4b-it', supportsImages: true },
        { kind: 'openai', model: 'legacy-chat-model', supportsImages: false },
      ],
    });
  });

  it('promotes NVIDIA DiffusionGemma ahead of legacy when Groq is unavailable', () => {
    vi.stubEnv('NVIDIA_API_KEY', 'nvidia-key');
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('LLM_API_KEY', 'legacy-key');
    vi.stubEnv('LLM_BASE_URL', 'https://legacy.example/v1');
    vi.stubEnv('LLM_MODEL', 'legacy-chat-model');

    expect(getChatProviders()).toMatchObject({
      primary: { kind: 'nvidia', model: 'google/diffusiongemma-26b-a4b-it' },
      fallbacks: [{ kind: 'openai', model: 'legacy-chat-model' }],
    });
  });

  it('retains every configured provider in the selected vision chain', () => {
    vi.stubEnv('NVIDIA_API_KEY', 'nvidia-key');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('LLM_API_KEY', 'legacy-primary-key');
    vi.stubEnv('LLM_BASE_URL', 'https://legacy-primary.example/v1');
    vi.stubEnv('LLM_MODEL', 'legacy-primary-model');
    vi.stubEnv('LLM_ENABLE_FALLBACK_MODEL', 'true');
    vi.stubEnv('LLM_FALLBACK_API_KEY', 'legacy-fallback-key');
    vi.stubEnv('LLM_FALLBACK_BASE_URL', 'https://legacy-fallback.example/v1');
    vi.stubEnv('LLM_FALLBACK_MODEL', 'legacy-fallback-model');

    const providers = getChatProviders('kimi-k2.6');

    expect([providers.primary, ...providers.fallbacks].map((provider) => provider?.model)).toEqual([
      'moonshotai/kimi-k2.6',
      'qwen/qwen3.6-27b',
      'google/diffusiongemma-26b-a4b-it',
      'legacy-primary-model',
      'legacy-fallback-model',
    ]);
  });

  it('does not add DiffusionGemma to selected text-only NVIDIA chains', () => {
    vi.stubEnv('NVIDIA_API_KEY', 'nvidia-key');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');

    const providers = getChatProviders('glm-5.2');

    expect([providers.primary, ...providers.fallbacks].map((provider) => provider?.model)).toEqual([
      'z-ai/glm-5.2',
      'qwen/qwen3.6-27b',
    ]);
  });
});