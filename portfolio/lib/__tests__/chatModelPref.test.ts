import { describe, expect, it } from 'vitest';

import { DEFAULT_CHAT_MODEL_ID } from '@/lib/chatModels';
import { readChatModelPref } from '@/lib/chatModelPref';

describe('chat model preference', () => {
  it('uses the catalog default and rejects unrecognized stored values', () => {
    expect(readChatModelPref(null)).toBe(DEFAULT_CHAT_MODEL_ID);
    expect(readChatModelPref('not-a-model')).toBe(DEFAULT_CHAT_MODEL_ID);
    expect(readChatModelPref('gpt-oss-120b')).toBe(DEFAULT_CHAT_MODEL_ID);
    expect(readChatModelPref('diffusiongemma-26b')).toBe(DEFAULT_CHAT_MODEL_ID);
  });
});