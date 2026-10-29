export const DEFAULT_CHAT_MODEL_ID = 'qwen-3.8-27b' as const;

export const CHAT_MODEL_CAPABILITIES = ['fast', 'image', 'reasoning', 'slow'] as const;
export type ChatModelCapability = (typeof CHAT_MODEL_CAPABILITIES)[number];
export type ChatImageInputOrder = 'image-first' | 'text-first';

interface ChatModelDefinitionBase {
  id: string;
  provider: 'groq' | 'nvidia' | 'local' | 'browser';
  group: 'Recommended' | 'NVIDIA' | 'Local agent' | 'On device';
  upstreamModel: string;
  label: string;
  quality: string;
  capabilities: readonly ChatModelCapability[];
  isRecommended?: boolean;
  caveat?: string;
}

type ChatModelDefinition = ChatModelDefinitionBase & (
  | { supportsImages: true; imageInputOrder: ChatImageInputOrder; imageMaxPixels?: number }
  | { supportsImages: false; imageInputOrder?: never; imageMaxPixels?: never }
);

export const CHAT_MODELS = [
  {
    id: 'qwen-3.8-27b',
    provider: 'groq',
    group: 'Recommended',
    upstreamModel: 'qwen/qwen3.8-27b',
    label: 'Qwen 3.8 27B',
    quality: 'Recommended',
    supportsImages: true,
    imageInputOrder: 'text-first',
    capabilities: ['fast', 'image'],
    isRecommended: true,
  },
  {
    id: 'minimax-m3.1-flash',
    provider: 'nvidia',
    group: 'NVIDIA',
    upstreamModel: 'minimaxai/minimax-m3.1-flash',
    label: 'MiniMax M3.1 Flash',
    quality: 'Vision',
    supportsImages: true,
    imageInputOrder: 'text-first',
    capabilities: ['image'],
    caveat: 'Research and development use only.',
  },
  {
    id: 'deepseek-v4.1-flash',
    provider: 'nvidia',
    group: 'NVIDIA',
    upstreamModel: 'deepseek-ai/deepseek-v4.1-flash',
    label: 'DeepSeek V4.1 Flash',
    quality: 'Fast',
    supportsImages: true,
    imageInputOrder: 'text-first',
    capabilities: ['fast', 'image'],
  },
  {
    id: 'nemotron-3.5-super-vl-120b-a12b',
    provider: 'nvidia',
    group: 'NVIDIA',
    upstreamModel: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
    label: 'Nemotron 3.5 Super VL 120B',
    quality: 'Strong reasoning',
    supportsImages: true,
    imageInputOrder: 'text-first',
    capabilities: ['reasoning', 'image', 'slow'],
  },
  {
    id: 'qwen-3.5-4b-local',
    provider: 'local',
    group: 'Local agent',
    upstreamModel: 'LFM3-1.7B',
    label: 'LFM3 1.7B',
    quality: 'Local agent',
    supportsImages: false,
    capabilities: ['fast'],
  },
  {
    id: 'lfm3-omni-local',
    provider: 'local',
    group: 'Local agent',
    upstreamModel: 'LFM3-Omni-2B',
    label: 'LFM3 Omni 2B',
    quality: 'Local vision',
    supportsImages: true,
    imageInputOrder: 'image-first',
    // LFM3 Omni spends one token per 32x32 px and llm-omni caps images at 256 tokens.
    imageMaxPixels: 256 * 32 * 32,
    capabilities: ['image', 'slow'],
  },
  {
    id: 'on-device',
    provider: 'browser',
    group: 'On device',
    upstreamModel: 'daveycodez/LFM3-1.7B-Web',
    label: 'LFM3 1.7B',
    quality: 'Runs in your browser',
    supportsImages: false,
    capabilities: ['slow'],
  },
] as const satisfies readonly ChatModelDefinition[];

export type ChatModel = (typeof CHAT_MODELS)[number];
export type ChatModelId = ChatModel['id'];

export const CHAT_PROVIDER_LABELS: Record<ChatModel['provider'], string> = {
  groq: 'Groq',
  nvidia: 'NVIDIA',
  local: 'Local agent',
  browser: 'Your browser',
};

export function getChatModel(modelId: string | undefined): ChatModel | undefined {
  return CHAT_MODELS.find((model) => model.id === modelId);
}

export function isChatModelId(modelId: unknown): modelId is ChatModelId {
  return typeof modelId === 'string' && getChatModel(modelId) !== undefined;
}

export type BrowserChatModelId = Extract<ChatModel, { provider: 'browser' }>['id'];
export type LocalChatModelId = Extract<ChatModel, { provider: 'local' }>['id'];
export type NvidiaChatModelId = Extract<ChatModel, { provider: 'nvidia' }>['id'];
export type ServerChatModelId = Exclude<ChatModelId, BrowserChatModelId>;

// Off until the pinned WebGPU build passes a browser smoke test on transformers.js 4.3.2 (first lfm3 release).
export const ON_DEVICE_CHAT_ENABLED: boolean = false;

export const SELECTABLE_CHAT_MODELS: readonly ChatModel[] = CHAT_MODELS.filter(
  (model) => model.provider !== 'browser' || ON_DEVICE_CHAT_ENABLED,
);

export function isSelectableChatModelId(modelId: unknown): modelId is ChatModelId {
  return SELECTABLE_CHAT_MODELS.some((model) => model.id === modelId);
}

export function isBrowserChatModelId(modelId: unknown): modelId is BrowserChatModelId {
  return typeof modelId === 'string' && getChatModel(modelId)?.provider === 'browser';
}

export function isLocalChatModelId(modelId: unknown): modelId is LocalChatModelId {
  return typeof modelId === 'string' && getChatModel(modelId)?.provider === 'local';
}