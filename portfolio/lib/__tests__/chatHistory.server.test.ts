import { afterEach, describe, expect, it, vi } from 'vitest';

import { selectRecentChatHistory, signAssistantMessage, verifyAssistantMessage } from '@/lib/chatHistory.server';

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

describe('selectRecentChatHistory', () => {
  it('keeps the eight newest eligible messages in chronological order', () => {
    const messages = Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `message-${index}`,
    }));

    expect(selectRecentChatHistory(messages).map((message) => message.content)).toEqual([
      'message-2',
      'message-3',
      'message-4',
      'message-5',
      'message-6',
      'message-7',
      'message-8',
      'message-9',
    ]);
  });

  it('keeps a contiguous recent window inside the content budget', () => {
    const old = { role: 'user' as const, content: 'old'.repeat(100) };
    const middle = { role: 'assistant' as const, content: 'middle'.repeat(500) };
    const latest = { role: 'user' as const, content: 'latest'.repeat(500) };
    const selected = selectRecentChatHistory([old, middle, latest]);

    expect(selected).toEqual([latest]);
    expect(selected.reduce((total, message) => total + message.content.length, 0)).toBeLessThanOrEqual(3_200);
  });

  it('always preserves the latest valid capped message', () => {
    const latest = { role: 'user' as const, content: 'latest'.repeat(83) };

    expect(selectRecentChatHistory([{ role: 'assistant' as const, content: 'older'.repeat(550) }, latest])).toEqual([latest]);
  });
});

describe('chat history action validation', () => {
  const content = 'Assistant reply';

  it('rejects signed actions with arbitrary paths, URLs, and populated invalid fields', () => {
    const signature = signAssistantMessage(content, null);

    expect(verifyAssistantMessage({ role: 'assistant', content, signature, action: { navigateTo: '/admin' } })).toBeNull();
    expect(verifyAssistantMessage({ role: 'assistant', content, signature, action: { openUrls: ['https://example.com'] } })).toBeNull();
    expect(verifyAssistantMessage({ role: 'assistant', content, signature, action: { feedbackAction: false } })).toBeNull();
    expect(verifyAssistantMessage({ role: 'assistant', content, signature, action: { commandPaletteAction: true, extra: 'tampered' } as never })).toBeNull();
    expect(verifyAssistantMessage({ role: 'assistant', content, signature, action: { themeAction: 'dark', projectSlug: 'cropio', commandPaletteAction: true, feedbackAction: true } })).toBeNull();
    expect(verifyAssistantMessage({ role: 'assistant', content, signature, action: { projectSlug: 'cropio', feedbackAction: true } })).toBeNull();
    expect(verifyAssistantMessage({ role: 'assistant', content, signature, action: { navigateTo: '/projects', commandPaletteAction: true } })).toBeNull();
    expect(() => signAssistantMessage(content, { navigateTo: '/admin' })).toThrow('Invalid chat action');
  });

  it('keeps legacy empty action objects compatible as actionless history', () => {
    const signature = signAssistantMessage(content, null);

    expect(verifyAssistantMessage({ role: 'assistant', content, signature, action: {} })).toEqual({
      role: 'assistant',
      content,
    });
  });

  it('signs and verifies an allowlisted composite action', () => {
    const action = { commandPaletteAction: true, themeAction: 'dark' as const, openUrls: ['https://github.com/Dhruv-Mishra'] };
    const signature = signAssistantMessage(content, action);

    expect(verifyAssistantMessage({ role: 'assistant', content, signature, action })).toEqual({
      role: 'assistant',
      content,
      action,
    });
    expect(verifyAssistantMessage({
      role: 'assistant',
      content,
      signature,
      action: { ...action, themeAction: 'light' },
    })).toBeNull();
  });
});