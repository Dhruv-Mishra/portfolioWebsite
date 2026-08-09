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
    expect(CHAT_MODELS).toHaveLength(5);
    expect(CHAT_MODELS.map((model) => model.upstreamModel)).toEqual([
      'qwen/qwen3.6-27b',
      'minimaxai/minimax-m3',
      'deepseek-ai/deepseek-v4-flash-0731',
      'nvidia/nemotron-3-super-120b-a12b',
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
    expect(isChatModelId('diffusiongemma-26b')).toBe(false);
    expect(isChatModelId('qwen-3.6-27b')).toBe(true);
    expect(isChatModelId('qwen-3.5-4b-local')).toBe(true);
  });

  it('declares picker capabilities explicitly for every model', () => {
    expect(Object.fromEntries(CHAT_MODELS.map((model) => [model.id, model.capabilities]))).toEqual({
      'qwen-3.6-27b': ['fast', 'image'],
      'minimax-m3': ['image'],
      'deepseek-v4-flash': ['fast'],
      'nemotron-3-super-120b-a12b': ['reasoning', 'slow'],
      'qwen-3.5-4b-local': ['slow'],
    });
  });

  it('advertises images only for documented vision models with an explicit payload order', () => {
    expect(CHAT_MODELS.filter((model) => model.supportsImages).map((model) => model.id)).toEqual([
      'qwen-3.6-27b',
      'minimax-m3',
    ]);
    expect(Object.fromEntries(CHAT_MODELS.map((model) => [
      model.id,
      'imageInputOrder' in model ? model.imageInputOrder : null,
    ]))).toEqual({
      'qwen-3.6-27b': 'text-first',
      'minimax-m3': 'text-first',
      'deepseek-v4-flash': null,
      'nemotron-3-super-120b-a12b': null,
      'qwen-3.5-4b-local': null,
    });
    for (const model of CHAT_MODELS) {
      expect(model.capabilities.some((capability) => capability === 'image')).toBe(model.supportsImages);
    }
  });
});