import { describe, expect, it } from 'vitest';

import { getChatModel } from '@/lib/chatModels';
import {
  getChatModelDisplayName,
  isChatModelFacingIssues,
  isLocalChatModelHealthy,
  parseChatModelStatusPayload,
} from '@/lib/chatModelStatus';

describe('chat model status', () => {
  it('accepts configured-unavailable models while retaining local health and canary IDs', () => {
    expect(parseChatModelStatusPayload({
      models: [
        { id: 'qwen-3.8-27b', available: true },
        { id: 'minimax-m3.1-flash', available: false },
      ],
      deploymentCanaryModelIds: ['qwen-3.8-27b', 'unknown-model'],
      localModelStatus: { healthy: true, modelName: 'LFM3-1.7B', models: ['LFM3-1.7B', 'LFM3-Omni-2B'] },
    })).toEqual({
      advisoryIssueModelIds: [],
      configuredUnavailableModelIds: ['minimax-m3.1-flash'],
      deploymentCanaryModelIds: ['qwen-3.8-27b'],
      local: { healthy: true, modelName: 'LFM3-1.7B', models: ['LFM3-1.7B', 'LFM3-Omni-2B'] },
    });
  });

  it('marks each local model healthy only while the gateway serves it', () => {
    const textOnly = { healthy: true, modelName: 'Qwen3.5-4B', models: ['Qwen3.5-4B', 'LFM3-1.7B'] };
    expect(isLocalChatModelHealthy(getChatModel('qwen-3.5-4b-local'), textOnly)).toBe(true);
    expect(isLocalChatModelHealthy(getChatModel('lfm3-omni-local'), textOnly)).toBe(false);
    expect(isLocalChatModelHealthy(getChatModel('lfm3-omni-local'), { ...textOnly, models: ['lfm3-omni-2b'] })).toBe(true);
    expect(isLocalChatModelHealthy(getChatModel('qwen-3.5-4b-local'), { ...textOnly, healthy: false })).toBe(false);
    expect(isLocalChatModelHealthy(getChatModel('qwen-3.8-27b'), textOnly)).toBe(false);
  });

  it('treats a legacy status without a model list as serving only its advertised model', () => {
    expect(parseChatModelStatusPayload({
      models: [],
      localModelStatus: { healthy: true, modelName: 'LFM3-1.7B' },
    })?.local).toEqual({ healthy: true, modelName: 'LFM3-1.7B', models: ['LFM3-1.7B'] });
  });

  it('uses catalog labels for display names', () => {
    expect(getChatModelDisplayName(getChatModel('qwen-3.5-4b-local'))).toBe('Qwen3.5 4B');
    expect(getChatModelDisplayName(getChatModel('qwen-3.8-27b'))).toBe('Qwen 3.8 27B');
    expect(getChatModelDisplayName(undefined)).toBe('');
  });

  it('rejects malformed status payloads', () => {
    expect(parseChatModelStatusPayload({ models: 'unavailable' })).toBeNull();
    expect(parseChatModelStatusPayload({
      models: [],
      local: { healthy: true, modelName: '' },
    })).toEqual({
      advisoryIssueModelIds: [],
      configuredUnavailableModelIds: [],
      deploymentCanaryModelIds: [],
      local: null,
    });
  });

  it('flags only fresh degraded or unhealthy advisory models without disabling other status behavior', () => {
    const status = parseChatModelStatusPayload({
      models: [],
      advisoryHealth: {
        expiresAt: '2099-08-09T00:20:00.000Z',
        models: [
          { id: 'qwen-3.8-27b', state: 'degraded' },
          { id: 'minimax-m3.1-flash', state: 'unhealthy' },
          { id: 'deepseek-v4.1-flash', state: 'healthy' },
          { id: 'nemotron-3.5-super-vl-120b-a12b', state: 'unknown' },
        ],
      },
    });

    expect(status?.advisoryIssueModelIds).toEqual(['qwen-3.8-27b', 'minimax-m3.1-flash']);
    expect(status && isChatModelFacingIssues('qwen-3.8-27b', {
      ...status,
      issueModelIds: [],
    })).toBe(true);
    expect(status && isChatModelFacingIssues('deepseek-v4.1-flash', {
      ...status,
      issueModelIds: [],
    })).toBe(false);
    expect(parseChatModelStatusPayload({
      models: [],
      advisoryHealth: {
        expiresAt: '2020-08-09T00:20:00.000Z',
        models: [{ id: 'qwen-3.8-27b', state: 'unhealthy' }],
      },
    })?.advisoryIssueModelIds).toEqual([]);
  });
});