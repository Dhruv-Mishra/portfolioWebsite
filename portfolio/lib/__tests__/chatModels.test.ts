import { describe, expect, it } from 'vitest';

import { CHAT_MODELS, DEFAULT_CHAT_MODEL_ID, getChatModel, isChatModelId } from '@/lib/chatModels';

describe('chat model catalog', () => {
  it('uses Qwen as the recommended default and allowlists every supported upstream model', () => {
    expect(DEFAULT_CHAT_MODEL_ID).toBe('qwen-3.6-27b');
    expect(getChatModel(DEFAULT_CHAT_MODEL_ID)).toMatchObject({
      provider: 'groq',
      upstreamModel: 'qwen/qwen3.6-27b',
      supportsImages: true,
      isRecommended: true,
    });
    expect(CHAT_MODELS).toHaveLength(7);
    expect(CHAT_MODELS.map((model) => model.upstreamModel)).toEqual([
      'qwen/qwen3.6-27b',
      'z-ai/glm-5.2',
      'thinkingmachines/inkling',
      'minimaxai/minimax-m3',
      'google/diffusiongemma-26b-a4b-it',
      'deepseek-ai/deepseek-v4-flash',
      'deepseek-ai/deepseek-v4-pro',
    ]);
  });

  it('rejects unknown client model identifiers', () => {
    expect(isChatModelId('llama-3.1-8b-instant')).toBe(false);
    expect(isChatModelId('qwen-3.6-27b')).toBe(true);
  });

  it('declares picker capabilities explicitly for every model', () => {
    expect(Object.fromEntries(CHAT_MODELS.map((model) => [model.id, model.capabilities]))).toEqual({
      'qwen-3.6-27b': ['fast', 'image'],
      'glm-5.2': ['reasoning', 'slow'],
      inkling: ['fast', 'image'],
      'minimax-m3': ['image'],
      'diffusiongemma-26b': ['image'],
      'deepseek-v4-flash': ['fast'],
      'deepseek-v4-pro': ['reasoning', 'slow'],
    });
  });

  it('advertises images only for documented vision models with an explicit payload order', () => {
    expect(CHAT_MODELS.filter((model) => model.supportsImages).map((model) => model.id)).toEqual([
      'qwen-3.6-27b',
      'inkling',
      'minimax-m3',
      'diffusiongemma-26b',
    ]);
    expect(Object.fromEntries(CHAT_MODELS.map((model) => [
      model.id,
      'imageInputOrder' in model ? model.imageInputOrder : null,
    ]))).toEqual({
      'qwen-3.6-27b': 'text-first',
      'glm-5.2': null,
      inkling: 'text-first',
      'minimax-m3': 'text-first',
      'diffusiongemma-26b': 'image-first',
      'deepseek-v4-flash': null,
      'deepseek-v4-pro': null,
    });
    for (const model of CHAT_MODELS) {
      expect(model.capabilities.some((capability) => capability === 'image')).toBe(model.supportsImages);
    }
  });
});