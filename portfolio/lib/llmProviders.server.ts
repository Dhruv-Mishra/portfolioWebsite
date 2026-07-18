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
  fallbacks: LLMProvider[];
}

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const MAIN_STOP = ['\n\n\n', '\nUser:', '\nAssistant:'];

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