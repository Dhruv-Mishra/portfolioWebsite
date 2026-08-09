import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { getChatModel } from '@/lib/chatModels';
import { getChatModelDisplayName, parseChatModelStatusPayload } from '@/lib/chatModelStatus';

const source = fs.readFileSync(
  path.join(process.cwd(), 'lib', 'chatModelStatus.ts'),
  'utf8',
);

describe('chat model status', () => {
  it('accepts configured-unavailable models while retaining local health and canary IDs', () => {
    expect(parseChatModelStatusPayload({
      models: [
        { id: 'qwen-3.6-27b', available: true },
        { id: 'minimax-m3', available: false },
      ],
      deploymentCanaryModelIds: ['qwen-3.6-27b', 'unknown-model'],
      localModelStatus: { healthy: true, modelName: 'gemma-4-e2b-phone' },
    })).toEqual({
      configuredUnavailableModelIds: ['minimax-m3'],
      deploymentCanaryModelIds: ['qwen-3.6-27b'],
      local: { healthy: true, modelName: 'gemma-4-e2b-phone' },
    });
  });

  it('uses the healthy backend local model name without changing other catalog labels', () => {
    expect(getChatModelDisplayName(getChatModel('qwen-3.5-4b-local'), {
      healthy: true,
      modelName: 'gemma-4-e2b-phone',
    })).toBe('gemma-4-e2b-phone');
    expect(getChatModelDisplayName(getChatModel('qwen-3.6-27b'), null)).toBe('Qwen 3.6 27B');
  });

  it('rejects malformed status payloads', () => {
    expect(parseChatModelStatusPayload({ models: 'unavailable' })).toBeNull();
    expect(parseChatModelStatusPayload({
      models: [],
      local: { healthy: true, modelName: '' },
    })).toEqual({
      configuredUnavailableModelIds: [],
      deploymentCanaryModelIds: [],
      local: null,
    });
  });

  it('uses one TTL-bound in-flight request and keeps backend status out of storage', () => {
    expect(source).toContain('CHAT_MODEL_STATUS_TTL_MS = 30_000');
    expect(source).toContain('let inFlightRequest: Promise<ChatModelStatusSnapshot> | null = null;');
    expect(source).toContain("fetch('/api/chat/model-status')");
    expect(source).toContain('if (inFlightRequest) return inFlightRequest;');
    expect(source).not.toContain('localStorage');
    expect(source).not.toContain('sessionStorage');
  });
});