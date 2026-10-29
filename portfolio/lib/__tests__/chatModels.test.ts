import { describe, expect, it } from 'vitest';

import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL_ID,
  ON_DEVICE_CHAT_ENABLED,
  SELECTABLE_CHAT_MODELS,
  getChatModel,
  isBrowserChatModelId,
  isChatModelId,
  isSelectableChatModelId,
} from '@/lib/chatModels';
import { readChatModelPref } from '@/lib/chatModelPref';

describe('chat model catalog', () => {
  it('uses Qwen as the recommended default and allowlists every supported upstream model', () => {
    expect(DEFAULT_CHAT_MODEL_ID).toBe('qwen-3.8-27b');
    expect(getChatModel(DEFAULT_CHAT_MODEL_ID)).toMatchObject({
      provider: 'groq',
      upstreamModel: 'qwen/qwen3.8-27b',
      supportsImages: true,
      isRecommended: true,
    });
    expect(CHAT_MODELS).toHaveLength(6);
    expect(CHAT_MODELS.map((model) => model.upstreamModel)).toEqual([
      'qwen/qwen3.8-27b',
      'minimaxai/minimax-m3',
      'deepseek-ai/deepseek-v4-flash-0731',
      'nvidia/nemotron-3-super-120b-a12b',
      'gemma-4-e2b-phone',
      'daveycodez/LFM3-1.7B-Web',
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
    expect(isChatModelId('qwen-3.8-27b')).toBe(true);
    expect(isChatModelId('qwen-3.5-4b-local')).toBe(true);
  });

  it('marks only the on-device model as browser-run', () => {
    expect(CHAT_MODELS.filter((model) => isBrowserChatModelId(model.id)).map((model) => model.id)).toEqual(['on-device']);
    expect(isBrowserChatModelId('qwen-3.8-27b')).toBe(false);
    expect(isBrowserChatModelId('unknown')).toBe(false);
  });

  it('keeps the on-device model unselectable while the feature is off', () => {
    expect(ON_DEVICE_CHAT_ENABLED).toBe(false);
    expect(SELECTABLE_CHAT_MODELS.map((model) => model.id)).not.toContain('on-device');
    expect(isSelectableChatModelId('on-device')).toBe(false);
    expect(readChatModelPref('on-device')).toBe(DEFAULT_CHAT_MODEL_ID);
  });

  it('declares picker capabilities explicitly for every model', () => {
    expect(Object.fromEntries(CHAT_MODELS.map((model) => [model.id, model.capabilities]))).toEqual({
      'qwen-3.8-27b': ['fast', 'image'],
      'minimax-m3': ['image'],
      'deepseek-v4-flash': ['fast'],
      'nemotron-3-super-120b-a12b': ['reasoning', 'slow'],
      'qwen-3.5-4b-local': ['slow'],
      'on-device': ['slow'],
    });
  });

  it('advertises images only for documented vision models with an explicit payload order', () => {
    expect(CHAT_MODELS.filter((model) => model.supportsImages).map((model) => model.id)).toEqual([
      'qwen-3.8-27b',
      'minimax-m3',
    ]);
    expect(Object.fromEntries(CHAT_MODELS.map((model) => [
      model.id,
      'imageInputOrder' in model ? model.imageInputOrder : null,
    ]))).toEqual({
      'qwen-3.8-27b': 'text-first',
      'minimax-m3': 'text-first',
      'deepseek-v4-flash': null,
      'nemotron-3-super-120b-a12b': null,
      'qwen-3.5-4b-local': null,
      'on-device': null,
    });
    for (const model of CHAT_MODELS) {
      expect(model.capabilities.some((capability) => capability === 'image')).toBe(model.supportsImages);
    }
  });
});