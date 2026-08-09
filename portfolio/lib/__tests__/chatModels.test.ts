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
    expect(CHAT_MODELS).toHaveLength(10);
    expect(CHAT_MODELS.map((model) => model.upstreamModel)).toEqual([
      'qwen/qwen3.6-27b',
      'z-ai/glm-5.2',
      'thinkingmachines/inkling',
      'minimaxai/minimax-m3',
      'google/diffusiongemma-26b-a4b-it',
      'deepseek-ai/deepseek-v4-flash-0731',
      'google/gemma-4-31b-it',
      'nvidia/nemotron-3-super-120b-a12b',
      'openai/gpt-oss-120b',
      'gemma-4-e2b-phone',
    ]);
    expect(getChatModel('qwen-3.5-4b-local')).toEqual({
      id: 'qwen-3.5-4b-local',
      provider: 'local',
      group: 'Local agent',
      upstreamModel: 'gemma-4-e2b-phone',
      label: 'Local model',
      quality: 'Local agent',
      supportsImages: false,
      capabilities: ['slow'],
    });
  });

  it('rejects unknown client model identifiers', () => {
    expect(isChatModelId('llama-3.1-8b-instant')).toBe(false);
    expect(isChatModelId('qwen-3.6-27b')).toBe(true);
    expect(isChatModelId('qwen-3.5-4b-local')).toBe(true);
  });

  it('declares picker capabilities explicitly for every model', () => {
    expect(Object.fromEntries(CHAT_MODELS.map((model) => [model.id, model.capabilities]))).toEqual({
      'qwen-3.6-27b': ['fast', 'image'],
      'glm-5.2': ['reasoning', 'slow'],
      inkling: ['fast', 'image'],
      'minimax-m3': ['image'],
      'diffusiongemma-26b': ['image'],
      'deepseek-v4-flash': ['fast'],
      'gemma-4-31b-it': ['image'],
      'nemotron-3-super-120b-a12b': ['reasoning', 'slow'],
      'gpt-oss-120b': ['reasoning', 'slow'],
      'qwen-3.5-4b-local': ['slow'],
    });
  });

  it('advertises images only for documented vision models with an explicit payload order', () => {
    expect(CHAT_MODELS.filter((model) => model.supportsImages).map((model) => model.id)).toEqual([
      'qwen-3.6-27b',
      'inkling',
      'minimax-m3',
      'diffusiongemma-26b',
      'gemma-4-31b-it',
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
      'gemma-4-31b-it': 'text-first',
      'nemotron-3-super-120b-a12b': null,
      'gpt-oss-120b': null,
      'qwen-3.5-4b-local': null,
    });
    for (const model of CHAT_MODELS) {
      expect(model.capabilities.some((capability) => capability === 'image')).toBe(model.supportsImages);
    }
  });
});