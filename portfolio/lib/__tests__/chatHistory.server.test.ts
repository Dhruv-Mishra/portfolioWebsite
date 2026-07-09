import { afterEach, describe, expect, it, vi } from 'vitest';

import { signAssistantMessage, verifyAssistantMessage } from '@/lib/chatHistory.server';

describe('chat history signing secret', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed in production without a dedicated signing secret', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CHAT_HISTORY_SIGNING_SECRET', '');
    vi.stubEnv('LLM_API_KEY', 'provider-key-must-not-sign-history');
    vi.stubEnv('LLM_FALLBACK_API_KEY', 'fallback-provider-key-must-not-sign-history');

    expect(() => signAssistantMessage('Assistant reply', null))
      .toThrow('CHAT_HISTORY_SIGNING_SECRET is required in production.');
  });

  it('signs and verifies in production with the dedicated secret', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CHAT_HISTORY_SIGNING_SECRET', 'test-chat-history-signing-secret');

    const content = 'Assistant reply';
    const signature = signAssistantMessage(content, null);

    expect(verifyAssistantMessage({ role: 'assistant', content, signature })).toEqual({
      role: 'assistant',
      content,
    });
  });
});