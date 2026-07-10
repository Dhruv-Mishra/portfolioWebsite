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

const PRIMARY_PROVIDER = {
  kind: 'groq' as const,
  label: 'groq-suggestions',
  apiKey: 'groq-key',
  baseURL: 'https://api.groq.com/openai/v1',
  model: 'groq-model',
};

const FALLBACK_PROVIDER = {
  kind: 'openai' as const,
  label: 'legacy-suggestions',
  apiKey: 'legacy-key',
  baseURL: 'https://legacy.example/v1',
  model: 'legacy-model',
};

function createSuggestionsRequest(signal?: AbortSignal): NextRequest {
  const body = JSON.stringify({
    messages: [
      { role: 'user', content: 'What do you build?' },
      { role: 'assistant', content: 'I build reliable AI systems.' },
    ],
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