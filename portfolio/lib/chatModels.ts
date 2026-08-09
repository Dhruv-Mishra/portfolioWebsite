export const DEFAULT_CHAT_MODEL_ID = 'qwen-3.6-27b' as const;

export const CHAT_MODEL_CAPABILITIES = ['fast', 'image', 'reasoning', 'slow'] as const;
export type ChatModelCapability = (typeof CHAT_MODEL_CAPABILITIES)[number];
export type ChatImageInputOrder = 'image-first' | 'text-first';

interface ChatModelDefinitionBase {
  id: string;
  provider: 'groq' | 'nvidia' | 'local';
  group: 'Recommended' | 'NVIDIA' | 'Local agent';
  upstreamModel: string;
  label: string;
  quality: string;
  capabilities: readonly ChatModelCapability[];
  isRecommended?: boolean;
  caveat?: string;
}

type ChatModelDefinition = ChatModelDefinitionBase & (
  | { supportsImages: true; imageInputOrder: ChatImageInputOrder }
  | { supportsImages: false; imageInputOrder?: never }
);

export const CHAT_MODELS = [
  {
    id: 'qwen-3.6-27b',
    provider: 'groq',
    group: 'Recommended',
    upstreamModel: 'qwen/qwen3.6-27b',
    label: 'Qwen 3.6 27B',
    quality: 'Recommended',
    supportsImages: true,
    imageInputOrder: 'text-first',
    capabilities: ['fast', 'image'],
    isRecommended: true,
  },
  {
    id: 'minimax-m3',
    provider: 'nvidia',
    group: 'NVIDIA',
    upstreamModel: 'minimaxai/minimax-m3',
    label: 'MiniMax M3',
    quality: 'Preview',
    supportsImages: true,
    imageInputOrder: 'text-first',
    capabilities: ['image'],
    caveat: 'Preview model; non-commercial use only.',
  },
  {
    id: 'diffusiongemma-26b',
    provider: 'nvidia',
    group: 'NVIDIA',
    upstreamModel: 'google/diffusiongemma-26b-a4b-it',
    label: 'DiffusionGemma 26B',
    quality: 'Vision',
    supportsImages: true,
    imageInputOrder: 'image-first',
    capabilities: ['image'],
  },
  {
    id: 'deepseek-v4-flash',
    provider: 'nvidia',
    group: 'NVIDIA',
    upstreamModel: 'deepseek-ai/deepseek-v4-flash-0731',
    label: 'DeepSeek V4 Flash',
    quality: 'Fast',
    supportsImages: false,
    capabilities: ['fast'],
  },
  {
    id: 'gemma-4-31b-it',
    provider: 'nvidia',
    group: 'NVIDIA',
    upstreamModel: 'google/gemma-4-31b-it',
    label: 'Gemma 4 31B IT',
    quality: 'Vision',
    supportsImages: true,
    imageInputOrder: 'text-first',
    capabilities: ['image'],
  },
  {
    id: 'nemotron-3-super-120b-a12b',
    provider: 'nvidia',
    group: 'NVIDIA',
    upstreamModel: 'nvidia/nemotron-3-super-120b-a12b',
    label: 'Nemotron 3 Super 120B',
    quality: 'Strong reasoning',
    supportsImages: false,
    capabilities: ['reasoning', 'slow'],
  },
  {
    id: 'gpt-oss-120b',
    provider: 'nvidia',
    group: 'NVIDIA',
    upstreamModel: 'openai/gpt-oss-120b',
    label: 'GPT OSS 120B',
    quality: 'Strong reasoning',
    supportsImages: false,
    capabilities: ['reasoning', 'slow'],
  },
  {
    id: 'qwen-3.5-4b-local',
    provider: 'local',
    group: 'Local agent',
    upstreamModel: 'gemma-4-e2b-phone',
    label: 'Local model',
    quality: 'Local agent',
    supportsImages: false,
    capabilities: ['slow'],
  },
] as const satisfies readonly ChatModelDefinition[];

export type ChatModel = (typeof CHAT_MODELS)[number];
export type ChatModelId = ChatModel['id'];

export function getChatModel(modelId: string | undefined): ChatModel | undefined {
  return CHAT_MODELS.find((model) => model.id === modelId);
}

export function isChatModelId(modelId: unknown): modelId is ChatModelId {
  return typeof modelId === 'string' && getChatModel(modelId) !== undefined;
}