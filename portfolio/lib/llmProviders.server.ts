import 'server-only';

import OpenAI from 'openai';
import { DEFAULT_CHAT_MODEL_ID, getChatModel, type ChatModelId } from '@/lib/chatModels';

export type LLMProviderKind = 'groq' | 'nvidia' | 'openai';

export interface LLMProvider {
  kind: LLMProviderKind;
  apiKey: string;
  baseURL: string;
  model: string;
  modelId?: ChatModelId;
  label: string;
  supportsImages: boolean;
  acceptsSystemMessages?: boolean;
  sampling: {
    temperature: number;
    topP?: number;
    maxTokens?: number;
    maxCompletionTokens?: number;
    extraBody?: Record<string, unknown>;
  };
}

export interface ChatProviders {
  primary: LLMProvider | null;
  fallback: LLMProvider | null;
  legacyFallback: LLMProvider | null;
}

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const MAIN_STOP = ['\n\n\n', '\nUser:', '\nAssistant:'];

function isFallbackModelEnabled(): boolean {
  return process.env.LLM_ENABLE_FALLBACK_MODEL === 'true';
}

function getGroqQwenProvider(): LLMProvider | null {
  const apiKey = process.env.GROQ_API_KEY;
  const model = getChatModel(DEFAULT_CHAT_MODEL_ID);
  if (!apiKey || !model) return null;

  return {
    kind: 'groq',
    apiKey,
    baseURL: GROQ_BASE_URL,
    model: model.upstreamModel,
    modelId: model.id,
    label: `groq:${model.upstreamModel}`,
    supportsImages: model.supportsImages,
    sampling: {
      temperature: 0.6,
      topP: 0.95,
      maxCompletionTokens: 384,
      extraBody: { stop: MAIN_STOP, reasoning_effort: 'none' },
    },
  };
}

function getNvidiaProvider(modelId: Exclude<ChatModelId, 'qwen-3.6-27b'>): LLMProvider | null {
  const apiKey = process.env.NVIDIA_API_KEY;
  const model = getChatModel(modelId);
  if (!apiKey || !model || model.provider !== 'nvidia') return null;

  const extraBody = (() => {
    switch (model.id) {
      case 'diffusiongemma-26b':
        return { chat_template_kwargs: { enable_thinking: false } };
      case 'minimax-m3':
        return { chat_template_kwargs: { thinking_mode: 'disabled' } };
      case 'kimi-k2.6':
        return { chat_template_kwargs: { thinking: false } };
      case 'deepseek-v4-flash':
      case 'deepseek-v4-pro':
        return { chat_template_kwargs: { thinking: false } };
      default:
        return undefined;
    }
  })();

  return {
    kind: 'nvidia',
    apiKey,
    baseURL: NVIDIA_BASE_URL,
    model: model.upstreamModel,
    modelId: model.id,
    label: `nvidia:${model.upstreamModel}`,
    supportsImages: model.supportsImages,
    acceptsSystemMessages: model.id !== 'diffusiongemma-26b',
    sampling: {
      temperature: 0.6,
      maxTokens: 384,
      extraBody,
    },
  };
}

function getLegacyProviders(): { primary: LLMProvider | null; fallback: LLMProvider | null } {
  const primary: LLMProvider | null = (process.env.LLM_API_KEY && process.env.LLM_BASE_URL && process.env.LLM_MODEL)
    ? {
        kind: 'openai',
        apiKey: process.env.LLM_API_KEY,
        baseURL: process.env.LLM_BASE_URL,
        model: process.env.LLM_MODEL,
        label: process.env.LLM_MODEL,
        supportsImages: false,
        sampling: { temperature: 0.6, maxTokens: 384 },
      }
    : null;
  const fallback: LLMProvider | null = (isFallbackModelEnabled() && process.env.LLM_FALLBACK_API_KEY && process.env.LLM_FALLBACK_BASE_URL && process.env.LLM_FALLBACK_MODEL)
    ? {
        kind: 'openai',
        apiKey: process.env.LLM_FALLBACK_API_KEY,
        baseURL: process.env.LLM_FALLBACK_BASE_URL,
        model: process.env.LLM_FALLBACK_MODEL,
        label: process.env.LLM_FALLBACK_MODEL,
        supportsImages: false,
        sampling: { temperature: 0.6, maxTokens: 384 },
      }
    : null;

  return { primary, fallback };
}

export function getChatProviders(selectedModelId: ChatModelId = DEFAULT_CHAT_MODEL_ID): ChatProviders {
  const legacy = getLegacyProviders();

  if (selectedModelId === DEFAULT_CHAT_MODEL_ID) {
    const groq = getGroqQwenProvider();
    const nvidiaFallback = getNvidiaProvider('diffusiongemma-26b');
    if (groq) {
      return {
        primary: groq,
        fallback: nvidiaFallback ?? legacy.primary ?? legacy.fallback,
        legacyFallback: nvidiaFallback
          ? legacy.primary ?? legacy.fallback
          : legacy.primary
            ? legacy.fallback
            : null,
      };
    }
    if (nvidiaFallback) {
      return {
        primary: nvidiaFallback,
        fallback: legacy.primary ?? legacy.fallback,
        legacyFallback: legacy.primary ? legacy.fallback : null,
      };
    }
    return { ...legacy, legacyFallback: null };
  }

  const nvidia = getNvidiaProvider(selectedModelId);
  return {
    primary: nvidia,
    fallback: legacy.primary ?? legacy.fallback,
    legacyFallback: legacy.primary ? legacy.fallback : null,
  };
}

export function getSuggestionsProviders(): { primary: LLMProvider | null; fallback: LLMProvider | null; legacyFallback: LLMProvider | null } {
  const nvidia = getNvidiaProvider('deepseek-v4-flash');
  const groq = getGroqQwenProvider();
  const legacy = getLegacyProviders();

  if (nvidia) return { primary: nvidia, fallback: groq, legacyFallback: legacy.primary ?? legacy.fallback };
  if (groq) return { primary: groq, fallback: legacy.primary ?? legacy.fallback, legacyFallback: legacy.fallback };
  return { primary: legacy.primary, fallback: legacy.fallback, legacyFallback: null };
}

export function createProviderClient(provider: LLMProvider): OpenAI {
  return new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    maxRetries: 0,
  });
}