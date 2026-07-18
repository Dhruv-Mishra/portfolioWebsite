export const DEFAULT_CHAT_MODEL_ID = 'qwen-3.6-27b' as const;

export const CHAT_MODEL_CAPABILITIES = ['fast', 'image', 'reasoning', 'slow'] as const;
export type ChatModelCapability = (typeof CHAT_MODEL_CAPABILITIES)[number];

interface ChatModelDefinition {
  id: string;
  provider: 'groq' | 'nvidia';
  group: 'Recommended' | 'NVIDIA';
  upstreamModel: string;
  label: string;
  quality: string;
  supportsImages: boolean;
  capabilities: readonly ChatModelCapability[];
  isRecommended?: boolean;
  caveat?: string;
}

export const CHAT_MODELS = [
  {
    id: 'qwen-3.6-27b',
    provider: 'groq',
    group: 'Recommended',
    upstreamModel: 'qwen/qwen3.6-27b',
    label: 'Qwen 3.6 27B',
    quality: 'Recommended',
    supportsImages: true,
    capabilities: ['fast', 'image'],
    isRecommended: true,
  },
  {
    id: 'glm-5.2',
    provider: 'nvidia',
    group: 'NVIDIA',
    upstreamModel: 'z-ai/glm-5.2',
    label: 'GLM 5.2',
    quality: 'Strong reasoning',
    supportsImages: false,
    capabilities: ['reasoning', 'slow'],
  },
  {
    id: 'inkling',
    provider: 'nvidia',
    group: 'NVIDIA',
    upstreamModel: 'thinkingmachines/inkling',
    label: 'Inkling',
    quality: 'Fast',
    supportsImages: true,
    capabilities: ['fast', 'image'],
  },
  {
    id: 'minimax-m3',
    provider: 'nvidia',
    group: 'NVIDIA',
    upstreamModel: 'minimaxai/minimax-m3',
    label: 'MiniMax M3',
    quality: 'Preview',
    supportsImages: true,
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
    capabilities: ['image'],
  },
  {
    id: 'kimi-k2.6',
    provider: 'nvidia',
    group: 'NVIDIA',
    upstreamModel: 'moonshotai/kimi-k2.6',
    label: 'Kimi K2.6',
    quality: 'Strong reasoning',
    supportsImages: true,
    capabilities: ['reasoning', 'image', 'slow'],
  },
  {
    id: 'deepseek-v4-flash',
    provider: 'nvidia',
    group: 'NVIDIA',
    upstreamModel: 'deepseek-ai/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    quality: 'Fast',
    supportsImages: false,
    capabilities: ['fast'],
  },
  {
    id: 'deepseek-v4-pro',
    provider: 'nvidia',
    group: 'NVIDIA',
    upstreamModel: 'deepseek-ai/deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    quality: 'High quality',
    supportsImages: false,
    capabilities: ['reasoning', 'slow'],
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