import 'server-only';

import OpenAI from 'openai';
import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL_ID,
  getChatModel,
  isBrowserChatModelId,
  isLocalChatModelId,
  type ChatImageInputOrder,
  type ChatModelId,
  type LocalChatModelId,
  type NvidiaChatModelId,
  type ServerChatModelId,
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
  /** Receives the site action tools (see lib/chatTools.ts). */
  supportsTools?: boolean;
  /**
   * Self-hosted LFM3 text layout: local rules in the cached system prompt, and per-turn context in a system
   * message after the visitor's message so llama.cpp's checkpoint at that message covers the whole prefix.
   */
  lfm3Layout?: boolean;
  sampling: {
    temperature: number;
    topP?: number;
    maxTokens?: number;
    maxCompletionTokens?: number;
    /** llama.cpp reasoning budget per request kind; the route adds it to the visible-reply cap. */
    reasoning?: Readonly<Record<'tools' | 'plain', ReasoningBudget>>;
    extraBody?: Record<string, unknown>;
  };
}

export interface ReasoningBudget {
  tokens: number;
  /** Forced, one token per decode step, to close the trace: keep it short. */
  message: string;
}

export interface ChatProviders {
  primary: LLMProvider | null;
  fallbacks: LLMProvider[];
}

export interface ChatModelRuntimeStatus {
  id: ServerChatModelId;
  provider: Exclude<(typeof CHAT_MODELS)[number]['provider'], 'browser'>;
  available: boolean;
}

export interface ChatModelRuntimeCatalog {
  models: ChatModelRuntimeStatus[];
  deploymentCanaryModelIds: ChatModelId[];
}

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const MAIN_STOP = ['\n\n\n', '\nUser:', '\nAssistant:'];
const MAIN_CHAT_MAX_TOKENS = 512;
const REASONING_CHAT_MAX_TOKENS = 2048;
const SUGGESTIONS_MAX_TOKENS = 512;

// LFM3 is trained to reason before it acts; with thinking off it writes a draft, `</think>`, then the answer.
// On toolbench a capped trace closed by a short cue scored close to unbudgeted thinking, and turns without
// tools lost nothing with 32 tokens.
export const LFM3_REASONING = {
  tools: { tokens: 128, message: '\nDecide: act only on a direct request.\n' },
  plain: { tokens: 32, message: '\nAnswer now.\n' },
} as const satisfies Record<'tools' | 'plain', ReasoningBudget>;

// Qwen3.5 4B scored best on toolbench with thinking off at temperature 0.3; the LFM3 models are greedy, as LiquidAI advises.
const LOCAL_SAMPLING: Record<LocalChatModelId, LLMProvider['sampling']> = {
  'qwen-3.5-4b-local': {
    temperature: 0.3,
    topP: 0.8,
    maxTokens: 512,
    extraBody: { top_k: 20, chat_template_kwargs: { enable_thinking: false } },
  },
  'lfm3-1.7b-local': {
    temperature: 0,
    maxTokens: 512,
    reasoning: LFM3_REASONING,
    extraBody: { chat_template_kwargs: { enable_thinking: true } },
  },
  'lfm3-omni-local': {
    temperature: 0,
    maxTokens: 512,
    extraBody: { chat_template_kwargs: { enable_thinking: false } },
  },
};

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
    supportsTools: true,
    sampling: {
      temperature: 0.6,
      topP: 0.95,
      maxCompletionTokens: 512,
      extraBody: { stop: MAIN_STOP, reasoning_effort: 'none' },
    },
  };
}

function getLocalAgentProvider(modelId: LocalChatModelId): LLMProvider | null {
  const apiKey = process.env.LOCAL_AGENT_API_KEY;
  const baseUrlValue = process.env.LOCAL_AGENT_BASE_URL;
  const model = getChatModel(modelId);
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
    label: `local:${model.upstreamModel}`,
    supportsImages: model.supportsImages,
    ...('imageInputOrder' in model ? { imageInputOrder: model.imageInputOrder } : {}),
    // The omni model is not reliable enough to act on its calls.
    supportsTools: !model.supportsImages,
    ...(model.id === 'lfm3-1.7b-local' ? { lfm3Layout: true } : {}),
    sampling: LOCAL_SAMPLING[model.id],
  };
}

function getNvidiaProvider(
  modelId: NvidiaChatModelId,
  maxTokens?: number,
): LLMProvider | null {
  const apiKey = process.env.NVIDIA_API_KEY;
  const model = getChatModel(modelId);
  if (!apiKey || !model || model.provider !== 'nvidia') return null;

  const { extraBody, defaultMaxTokens } = ((): { extraBody?: Record<string, unknown>; defaultMaxTokens: number } => {
    switch (model.id) {
      case 'minimax-m3.1-flash':
        // M3.1 has no thinking-off switch; low effort keeps replies quick.
        return { extraBody: { chat_template_kwargs: { reasoning_effort: 'low' } }, defaultMaxTokens: MAIN_CHAT_MAX_TOKENS };
      case 'deepseek-v4.1-flash':
        return { extraBody: { chat_template_kwargs: { thinking: false } }, defaultMaxTokens: MAIN_CHAT_MAX_TOKENS };
      case 'nemotron-3.5-super-vl-120b-a12b':
        // Thinking stays on for the reasoning pick, so the budget must cover the hidden trace too.
        return { extraBody: { chat_template_kwargs: { enable_thinking: true } }, defaultMaxTokens: REASONING_CHAT_MAX_TOKENS };
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
    supportsTools: true,
    sampling: {
      temperature: 0.6,
      maxTokens: maxTokens ?? defaultMaxTokens,
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

  if (isLocalChatModelId(selectedModelId)) {
    return toChatProviders([getLocalAgentProvider(selectedModelId)]);
  }

  if (isBrowserChatModelId(selectedModelId)) {
    return toChatProviders([]);
  }

  return toChatProviders([getNvidiaProvider(selectedModelId)]);
}

export function getChatModelRuntimeCatalog(): ChatModelRuntimeCatalog {
  const models: ChatModelRuntimeStatus[] = CHAT_MODELS.flatMap((model) => (
    model.provider === 'browser'
      ? []
      : [{
          id: model.id,
          provider: model.provider,
          available: getChatProviders(model.id).primary !== null,
        }]
  ));
  const configuredProviders = new Set<ChatModelRuntimeStatus['provider']>();
  const deploymentCanaryModelIds = models.flatMap((model) => {
    if (!model.available || configuredProviders.has(model.provider)) {
      return [];
    }

    configuredProviders.add(model.provider);
    return [model.id];
  });

  return { models, deploymentCanaryModelIds };
}

export function getSuggestionsProviders(): { primary: LLMProvider | null; fallback: LLMProvider | null; legacyFallback: LLMProvider | null } {
  const nvidia = getNvidiaProvider('deepseek-v4.1-flash', SUGGESTIONS_MAX_TOKENS);
  return { primary: nvidia, fallback: null, legacyFallback: null };
}

export function createProviderClient(provider: LLMProvider): OpenAI {
  return new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    maxRetries: 0,
  });
}