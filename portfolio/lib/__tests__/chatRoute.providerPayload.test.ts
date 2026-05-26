import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

import { signAssistantMessage } from '@/lib/chatHistory.server';

const { buildPromptPartsMock, groqCreateMock } = vi.hoisted(() => ({
  buildPromptPartsMock: vi.fn(async () => ({
    stable: 'stable system prompt',
    conditional: 'conditional system prompt',
  })),
  groqCreateMock: vi.fn(async () => ({
    choices: [{ message: { content: 'provider reply' } }],
  })),
}));

vi.mock('@/lib/chatActionRouter', () => ({
  resolveChatIntent: vi.fn(() => null),
}));

vi.mock('@/lib/chatContext.server', () => ({
  buildDhruvSystemPromptParts: buildPromptPartsMock,
}));

vi.mock('@/lib/serverRateLimit', () => ({
  createServerRateLimiter: vi.fn(() => ({
    check: vi.fn(() => ({ limited: false, retryAfter: 0 })),
  })),
  getClientIP: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/validateOrigin', () => ({
  validateOrigin: vi.fn(() => null),
}));

vi.mock('@/lib/llmProviders.server', () => ({
  getChatProviders: vi.fn(() => ({
    primary: {
      kind: 'groq',
      label: 'groq-primary',
      apiKey: 'test-key',
      baseURL: 'https://api.groq.com/openai/v1',
      model: 'llama-3.1-8b-instant',
    },
    fallback: null,
  })),
  createProviderClient: vi.fn(),
}));

vi.mock('groq-sdk', () => ({
  default: class GroqMock {
    chat = {
      completions: {
        create: groqCreateMock,
      },
    };
  },
}));

import { POST } from '@/app/api/chat/route';

describe('chat route provider payload mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps verified assistant action for prompt assembly but strips it from provider messages', async () => {
    const assistantAction = { projectSlug: 'cropio' };
    const assistantContent = 'Opening Cropio now.';
    const signature = signAssistantMessage(assistantContent, assistantAction);

    const body = JSON.stringify({
      messages: [
        { role: 'user', content: 'Show me cropio' },
        {
          role: 'assistant',
          content: assistantContent,
          signature,
          action: assistantAction,
        },
        { role: 'user', content: 'thanks' },
      ],
    });

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body)),
      },
      body,
    }) as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(buildPromptPartsMock).toHaveBeenCalledTimes(1);
    expect(buildPromptPartsMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          action: expect.objectContaining({ projectSlug: 'cropio' }),
        }),
      ]),
      { factLimit: 6 },
    );

    expect(groqCreateMock).toHaveBeenCalledTimes(1);
    const payload = groqCreateMock.mock.calls[0]?.[0] as {
      messages: Array<Record<string, unknown>>;
    };

    const providerAssistantMessage = payload.messages.find(
      (message) => message.role === 'assistant',
    );

    expect(providerAssistantMessage).toEqual({
      role: 'assistant',
      content: assistantContent,
    });
    expect(providerAssistantMessage && 'action' in providerAssistantMessage).toBe(false);
    expect(groqCreateMock.mock.calls[0]?.[0]).toMatchObject({
      max_completion_tokens: 400,
      temperature: 0.7,
      top_p: 0.9,
    });
  });
});
