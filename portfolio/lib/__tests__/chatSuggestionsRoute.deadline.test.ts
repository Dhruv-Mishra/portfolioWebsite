import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { createProviderClientMock, getSuggestionsProvidersMock, parseSuggestionResponseMock } = vi.hoisted(() => ({
  createProviderClientMock: vi.fn(),
  getSuggestionsProvidersMock: vi.fn(),
  parseSuggestionResponseMock: vi.fn(() => ['First suggestion', 'Second suggestion']),
}));

vi.mock('@/lib/chatSanitization', () => ({
  parseSuggestionResponse: parseSuggestionResponseMock,
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
  getSuggestionsProviders: getSuggestionsProvidersMock,
  createProviderClient: createProviderClientMock,
}));

import { POST } from '@/app/api/chat/suggestions/route';
import { SUGGESTIONS_SYSTEM_PROMPT } from '@/lib/chatSuggestionsPrompt.server';

const PRIMARY_PROVIDER = {
  kind: 'groq' as const,
  label: 'groq-suggestions',
  apiKey: 'groq-key',
  baseURL: 'https://api.groq.com/openai/v1',
  model: 'groq-model',
  sampling: {
    temperature: 0.6,
    topP: 0.95,
    maxCompletionTokens: 384,
    extraBody: { reasoning_effort: 'none' },
  },
};

const FALLBACK_PROVIDER = {
  kind: 'openai' as const,
  label: 'legacy-suggestions',
  apiKey: 'legacy-key',
  baseURL: 'https://legacy.example/v1',
  model: 'legacy-model',
  sampling: { temperature: 0.6, maxTokens: 384 },
};

const NVIDIA_PROVIDER = {
  kind: 'nvidia' as const,
  label: 'nvidia-suggestions',
  apiKey: 'nvidia-key',
  baseURL: 'https://integrate.api.nvidia.com/v1',
  model: 'deepseek-ai/deepseek-v4-flash-0731',
  sampling: {
    temperature: 0.6,
    maxTokens: 384,
    extraBody: { chat_template_kwargs: { thinking: false } },
  },
};

function createSuggestionsRequest(
  signal?: AbortSignal,
  messages = [
    { role: 'user', content: 'What do you build?' },
    { role: 'assistant', content: 'I build reliable AI systems.' },
  ],
): NextRequest {
  const body = JSON.stringify({
    messages,
  });
  return new Request('http://localhost/api/chat/suggestions', {
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

describe('chat suggestions route deadlines', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getSuggestionsProvidersMock.mockReturnValue({
      primary: PRIMARY_PROVIDER,
      fallback: FALLBACK_PROVIDER,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the suggestions prompt compact and enforces its output contract', () => {
    expect(SUGGESTIONS_SYSTEM_PROMPT.length).toBeLessThanOrEqual(1250);
    expect(SUGGESTIONS_SYSTEM_PROMPT).toContain('exactly 2 plain lines');
    expect(SUGGESTIONS_SYSTEM_PROMPT).toContain('2-8 casual words');
    expect(SUGGESTIONS_SYSTEM_PROMPT).toContain('use you/your for Dhruv, never I/my');
    expect(SUGGESTIONS_SYSTEM_PROMPT).toContain('last assistant reply directly');
    expect(SUGGESTIONS_SYSTEM_PROMPT).toContain('one affirmative and one decline or redirect');
    expect(SUGGESTIONS_SYSTEM_PROMPT).toContain('distinct, not rephrases');
    expect(SUGGESTIONS_SYSTEM_PROMPT).toContain('Never suggest themes');
    expect(SUGGESTIONS_SYSTEM_PROMPT).toContain('home, about, projects, resume, chat, guestbook, stickers, settings');
    expect(SUGGESTIONS_SYSTEM_PROMPT).toContain('approved links; project modals or repos; feedback');
    expect(SUGGESTIONS_SYSTEM_PROMPT).toContain('maximum 2 per suggestion');
  });

  it('uses the bounded suggestions completion ceiling', async () => {
    const createMock = vi.fn(async () => ({
      choices: [{ message: { content: 'First suggestion\nSecond suggestion' } }],
    }));
    createProviderClientMock.mockReturnValue({ chat: { completions: { create: createMock } } });
    getSuggestionsProvidersMock.mockReturnValue({ primary: PRIMARY_PROVIDER, fallback: null });

    await POST(createSuggestionsRequest());

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ max_completion_tokens: 48 }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('uses NVIDIA sampling and preserves its exact provider-specific body', async () => {
    const createMock = vi.fn<(
      payload: Record<string, unknown>,
      options?: { signal?: AbortSignal },
    ) => Promise<{ choices: Array<{ message: { content: string } }> }>>(async () => ({
        choices: [{ message: { content: 'First suggestion\nSecond suggestion' } }],
      }));
    createProviderClientMock.mockReturnValue({ chat: { completions: { create: createMock } } });
    getSuggestionsProvidersMock.mockReturnValue({ primary: NVIDIA_PROVIDER, fallback: null });

    await POST(createSuggestionsRequest());

    expect(createMock).toHaveBeenCalledWith({
      model: 'deepseek-ai/deepseek-v4-flash-0731',
      messages: [
        { role: 'system', content: SUGGESTIONS_SYSTEM_PROMPT },
        { role: 'user', content: 'What do you build?' },
        { role: 'assistant', content: 'I build reliable AI systems.' },
        { role: 'user', content: 'Generate 2 follow-up suggestions for the user.' },
      ],
      temperature: 0.6,
      max_tokens: 48,
      chat_template_kwargs: { thinking: false },
      stream: false,
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('normalizes malformed bounded context and merges the instruction into its final user turn', async () => {
    const createMock = vi.fn<(
      payload: Record<string, unknown>,
      options?: { signal?: AbortSignal },
    ) => Promise<{ choices: Array<{ message: { content: string } }> }>>(async () => ({
        choices: [{ message: { content: 'First suggestion\nSecond suggestion' } }],
      }));
    createProviderClientMock.mockReturnValue({ chat: { completions: { create: createMock } } });
    getSuggestionsProvidersMock.mockReturnValue({ primary: NVIDIA_PROVIDER, fallback: null, legacyFallback: null });

    await POST(createSuggestionsRequest(undefined, [
      { role: 'assistant', content: 'Leading reply to ignore' },
      { role: 'user', content: 'First user turn' },
      { role: 'user', content: 'Second user turn' },
      { role: 'assistant', content: 'A response' },
      { role: 'user', content: 'Final user turn' },
    ]));

    expect(createMock.mock.calls[0]?.[0]).toMatchObject({
      messages: [
        { role: 'system', content: SUGGESTIONS_SYSTEM_PROMPT },
        { role: 'user', content: 'First user turn\n\nSecond user turn' },
        { role: 'assistant', content: 'A response' },
        { role: 'user', content: 'Final user turn\n\nGenerate 2 follow-up suggestions for the user.' },
      ],
    });
  });

  it('uses Groq sampling while retaining the concise suggestions cap', async () => {
    const createMock = vi.fn<(
      payload: Record<string, unknown>,
      options?: { signal?: AbortSignal },
    ) => Promise<{ choices: Array<{ message: { content: string } }> }>>(async () => ({
        choices: [{ message: { content: 'First suggestion\nSecond suggestion' } }],
      }));
    createProviderClientMock.mockReturnValue({ chat: { completions: { create: createMock } } });
    getSuggestionsProvidersMock.mockReturnValue({ primary: PRIMARY_PROVIDER, fallback: null });

    await POST(createSuggestionsRequest());

    expect(createMock).toHaveBeenCalledWith({
      model: 'groq-model',
      messages: [
        { role: 'system', content: SUGGESTIONS_SYSTEM_PROMPT },
        { role: 'user', content: 'What do you build?' },
        { role: 'assistant', content: 'I build reliable AI systems.' },
        { role: 'user', content: 'Generate 2 follow-up suggestions for the user.' },
      ],
      temperature: 0.6,
      top_p: 0.95,
      max_completion_tokens: 48,
      reasoning_effort: 'none',
      stream: false,
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('reserves time for fallback before the seven second route deadline', async () => {
    const primaryCreateMock = vi.fn((...args: unknown[]) => {
      const options = args[1] as { signal: AbortSignal };
      return rejectWhenAborted(options.signal);
    });
    const fallbackCreateMock = vi.fn(async () => ({
      choices: [{ message: { content: 'provider suggestions' } }],
    }));
    createProviderClientMock.mockImplementation((provider: { label: string }) => ({
      chat: {
        completions: {
          create: provider.label === PRIMARY_PROVIDER.label ? primaryCreateMock : fallbackCreateMock,
        },
      },
    }));

    const responsePromise = POST(createSuggestionsRequest());
    await vi.advanceTimersByTimeAsync(4_499);
    expect(fallbackCreateMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    const response = await responsePromise;

    expect(fallbackCreateMock).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      suggestions: ['First suggestion', 'Second suggestion'],
    });
  });

  it('propagates request cancellation to the active provider', async () => {
    const requestController = new AbortController();
    let providerSignal: AbortSignal | undefined;
    const primaryCreateMock = vi.fn((...args: unknown[]) => {
      providerSignal = (args[1] as { signal: AbortSignal }).signal;
      return rejectWhenAborted(providerSignal);
    });
    createProviderClientMock.mockReturnValue({
      chat: { completions: { create: primaryCreateMock } },
    });
    getSuggestionsProvidersMock.mockReturnValue({ primary: PRIMARY_PROVIDER, fallback: null });

    const responsePromise = POST(createSuggestionsRequest(requestController.signal));
    await vi.advanceTimersByTimeAsync(0);
    expect(providerSignal?.aborted).toBe(false);

    requestController.abort('client-cancelled');
    const response = await responsePromise;

    expect(providerSignal?.aborted).toBe(true);
    await expect(response.json()).resolves.toEqual({ suggestions: [] });
  });

  it('finishes both failed attempts at the shared seven second deadline', async () => {
    createProviderClientMock.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn((...args: unknown[]) => {
            const options = args[1] as { signal: AbortSignal };
            return rejectWhenAborted(options.signal);
          }),
        },
      },
    });

    const responsePromise = POST(createSuggestionsRequest());
    await vi.advanceTimersByTimeAsync(6_999);

    let settled = false;
    void responsePromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const response = await responsePromise;

    await expect(response.json()).resolves.toEqual({ suggestions: [] });
  });
});