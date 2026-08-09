import 'server-only';

import OpenAI from 'openai';
import {
  DEFAULT_CHAT_MODEL_ID,
  getChatModel,
  type ChatImageInputOrder,
  type ChatModelId,
} from '@/lib/chatModels';
import { deriveLocalAgentUrls } from '@/lib/localAgentStatus.server';

export type LLMProviderKind = 'groq' | 'nvidia' | 'openai';

export interface LLMProvider {
  kind: LLMProviderKind;
  apiKey: string;
  baseURL: string;
  model: string;
  modelId?: ChatModelId;
  label: string;
  supportsImages: boolean;
  imageInputOrder?: ChatImageInputOrder;
  acceptsSystemMessages?: boolean;
  streamResponses?: boolean;
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
  fallbacks: LLMProvider[];
}

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const MAIN_STOP = ['\n\n\n', '\nUser:', '\nAssistant:'];

function getGroqQwenProvider(): LLMProvider | null {
  const apiKey = process.env.GROQ_API_KEY;
  const model = getChatModel(DEFAULT_CHAT_MODEL_ID);
  if (!apiKey || !model || !model.supportsImages) return null;

  return {
    kind: 'groq',
    apiKey,
    baseURL: GROQ_BASE_URL,
    model: model.upstreamModel,
    modelId: model.id,
    label: `groq:${model.upstreamModel}`,
    supportsImages: model.supportsImages,
    imageInputOrder: model.imageInputOrder,
    sampling: {
      temperature: 0.6,
      topP: 0.95,
      maxCompletionTokens: 384,
      extraBody: { stop: MAIN_STOP, reasoning_effort: 'none' },
    },
  };
}

function getLocalAgentProvider(): LLMProvider | null {
  const apiKey = process.env.LOCAL_AGENT_API_KEY;
  const baseUrlValue = process.env.LOCAL_AGENT_BASE_URL;
  const model = getChatModel('qwen-3.5-4b-local');
  if (!apiKey?.trim() || !baseUrlValue?.trim() || !model || model.provider !== 'local') return null;

  let baseURL: string;
  try {
    baseURL = deriveLocalAgentUrls(baseUrlValue.trim()).providerBaseUrl;
  } catch {
    return null;
  }

  return {
    kind: 'openai',
    apiKey,
    baseURL,
    model: model.upstreamModel,
    modelId: model.id,
    label: 'Local agent',
    supportsImages: model.supportsImages,
    sampling: {
      temperature: 0.7,
      topP: 0.8,
      maxTokens: 512,
      extraBody: { chat_template_kwargs: { enable_thinking: false } },
    },
  };
}

function getNvidiaProvider(modelId: Exclude<ChatModelId, 'qwen-3.6-27b' | 'qwen-3.5-4b-local'>): LLMProvider | null {
  const apiKey = process.env.NVIDIA_API_KEY;
  const model = getChatModel(modelId);
  if (!apiKey || !model || model.provider !== 'nvidia') return null;

  const extraBody = (() => {
    switch (model.id) {
      case 'diffusiongemma-26b':
        return { chat_template_kwargs: { enable_thinking: false } };
      case 'gemma-4-31b-it':
        return { chat_template_kwargs: { enable_thinking: false } };
      case 'minimax-m3':
        return { chat_template_kwargs: { thinking_mode: 'disabled' } };
      case 'deepseek-v4-flash':
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
    ...('imageInputOrder' in model ? { imageInputOrder: model.imageInputOrder } : {}),
    acceptsSystemMessages: model.id !== 'diffusiongemma-26b',
    ...(model.id === 'inkling' ? { streamResponses: false } : {}),
    sampling: {
      temperature: 0.6,
      maxTokens: 384,
      extraBody,
    },
  };
}

function toChatProviders(candidates: Array<LLMProvider | null>): ChatProviders {
  const providers = candidates.filter((provider): provider is LLMProvider => provider != null);

  return {
    primary: providers[0] ?? null,
    fallbacks: providers.slice(1),
  };
}

export function getChatProviders(selectedModelId: ChatModelId = DEFAULT_CHAT_MODEL_ID): ChatProviders {
  if (selectedModelId === DEFAULT_CHAT_MODEL_ID) {
    return toChatProviders([getGroqQwenProvider()]);
  }

  if (selectedModelId === 'qwen-3.5-4b-local') {
    return toChatProviders([getLocalAgentProvider()]);
  }

  return toChatProviders([getNvidiaProvider(selectedModelId)]);
}

export function getSuggestionsProviders(): { primary: LLMProvider | null; fallback: LLMProvider | null; legacyFallback: LLMProvider | null } {
  const nvidia = getNvidiaProvider('deepseek-v4-flash');
  return { primary: nvidia, fallback: null, legacyFallback: null };
}

export function createProviderClient(provider: LLMProvider): OpenAI {
  return new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    maxRetries: 0,
  });
}