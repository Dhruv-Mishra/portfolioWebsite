import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

import type { ActionExecution } from '@/lib/actions';
import { signAssistantMessage } from '@/lib/chatHistory.server';

type GroqCreate = (
  payload: Record<string, unknown>,
  options?: { signal?: AbortSignal },
) => Promise<{ choices: Array<{ message: { content: string } }> }>;

const { buildPromptPartsMock, createProviderClientMock, getChatProvidersMock, groqCreateMock } = vi.hoisted(() => ({
  buildPromptPartsMock: vi.fn(async () => ({
    stable: 'stable system prompt',
    conditional: 'conditional system prompt',
  })),
  createProviderClientMock: vi.fn(),
  getChatProvidersMock: vi.fn(),
  groqCreateMock: vi.fn<GroqCreate>(async () => ({
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
  getChatProviders: getChatProvidersMock,
  createProviderClient: createProviderClientMock,
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

const GROQ_PROVIDER = {
  kind: 'groq' as const,
  label: 'groq-primary',
  apiKey: 'test-key',
  baseURL: 'https://api.groq.com/openai/v1',
  model: 'llama-3.1-8b-instant',
};

const FALLBACK_PROVIDER = {
  kind: 'openai' as const,
  label: 'legacy-fallback',
  apiKey: 'fallback-key',
  baseURL: 'https://fallback.example/v1',
  model: 'fallback-model',
};

function createChatRequest(signal?: AbortSignal): NextRequest {
  const body = JSON.stringify({ messages: [{ role: 'user', content: 'Tell me about your work' }] });
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
    },
    body,
    signal,
  }) as unknown as NextRequest;
}

function rejectWhenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener(
      'abort',
      () => reject(new DOMException('Provider aborted', 'AbortError')),
      { once: true },
    );
  });
}

describe('chat route provider payload mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChatProvidersMock.mockReturnValue({ primary: GROQ_PROVIDER, fallback: null });
    groqCreateMock.mockResolvedValue({ choices: [{ message: { content: 'provider reply' } }] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps verified assistant action for prompt assembly but strips it from provider messages', async () => {
    const assistantAction: ActionExecution = { projectSlug: 'cropio' };
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
      max_completion_tokens: 220,
      temperature: 0.7,
      top_p: 0.9,
    });
  });

  it('starts the fallback within the shared deadline after the primary attempt budget', async () => {
    vi.useFakeTimers();
    getChatProvidersMock.mockReturnValue({ primary: GROQ_PROVIDER, fallback: FALLBACK_PROVIDER });
    groqCreateMock.mockImplementation((...args: unknown[]) => {
      const options = args[1] as { signal: AbortSignal };
      return rejectWhenAborted(options.signal);
    });

    const fallbackCreateMock = vi.fn(async () => ({
      choices: [{ message: { content: 'fallback reply' } }],
    }));
    createProviderClientMock.mockReturnValue({
      chat: { completions: { create: fallbackCreateMock } },
    });

    const responsePromise = POST(createChatRequest());
    await vi.advanceTimersByTimeAsync(27_999);
    expect(fallbackCreateMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    const response = await responsePromise;

    expect(fallbackCreateMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get('X-Chat-Fallback')).toBe('fallbackOnline');
    await expect(response.json()).resolves.toMatchObject({ reply: 'fallback reply' });
  });

  it('propagates request cancellation and returns a stable fallback reason code', async () => {
    vi.useFakeTimers();
    const requestController = new AbortController();
    let providerSignal: AbortSignal | undefined;
    groqCreateMock.mockImplementation((...args: unknown[]) => {
      providerSignal = (args[1] as { signal: AbortSignal }).signal;
      return rejectWhenAborted(providerSignal);
    });

    const responsePromise = POST(createChatRequest(requestController.signal));
    await vi.advanceTimersByTimeAsync(0);
    expect(providerSignal?.aborted).toBe(false);

    requestController.abort('client-cancelled');
    const response = await responsePromise;

    expect(providerSignal?.aborted).toBe(true);
    expect(response.headers.get('X-Chat-Fallback-Reason')).toBe('request-aborted');
  });

  it('does not expose raw provider errors in the fallback reason header', async () => {
    groqCreateMock.mockRejectedValue(new Error('upstream secret detail\r\napi-key-value'));

    const response = await POST(createChatRequest());

    expect(response.headers.get('X-Chat-Fallback-Reason')).toBe('all-providers-failed');
    expect(response.headers.get('X-Chat-Fallback-Reason')).not.toContain('secret');
  });
});
