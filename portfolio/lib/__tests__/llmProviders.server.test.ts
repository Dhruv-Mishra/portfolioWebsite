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

  it('uses NVIDIA DiffusionGemma as the default chat fallback and preserves exact selected NVIDIA models', () => {
    vi.stubEnv('NVIDIA_API_KEY', 'nvidia-key');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('LLM_API_KEY', 'legacy-key');
    vi.stubEnv('LLM_BASE_URL', 'https://legacy.example/v1');
    vi.stubEnv('LLM_MODEL', 'legacy-chat-model');

    const defaultProviders = getChatProviders();
    expect(defaultProviders).toMatchObject({
      primary: { kind: 'groq', model: 'qwen/qwen3.6-27b' },
      fallback: { kind: 'nvidia', model: 'google/diffusiongemma-26b-a4b-it', supportsImages: true },
      legacyFallback: { kind: 'openai', model: 'legacy-chat-model', supportsImages: false },
    });
    expect(defaultProviders.fallback?.sampling.extraBody).toEqual({
      chat_template_kwargs: { enable_thinking: false },
    });
    expect(getChatProviders('minimax-m3').primary).toMatchObject({
      kind: 'nvidia',
      model: 'minimaxai/minimax-m3',
    });
    expect(getChatProviders('minimax-m3').primary?.sampling.extraBody).toEqual({
      chat_template_kwargs: { thinking_mode: 'disabled' },
    });
    expect(getChatProviders('kimi-k2.6').primary).toMatchObject({
      kind: 'nvidia',
      model: 'moonshotai/kimi-k2.6',
    });
    expect(getChatProviders('kimi-k2.6').primary?.sampling.extraBody).toEqual({
      chat_template_kwargs: { thinking: false },
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
      fallback: { kind: 'openai', model: 'legacy-chat-model' },
      legacyFallback: null,
    });
  });
});