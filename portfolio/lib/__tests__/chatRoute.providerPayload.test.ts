import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import OpenAI from 'openai';

import type { ActionExecution } from '@/lib/actions';
import { signAssistantMessage } from '@/lib/chatHistory.server';

type GroqCreate = (
  payload: Record<string, unknown>,
  options?: { signal?: AbortSignal },
) => Promise<{ choices: Array<{ message: { content: string } }> }>;

type NvidiaStreamCreate = (
  payload: Record<string, unknown>,
  options?: { signal?: AbortSignal },
) => Promise<AsyncIterable<{ choices: Array<{ delta: { content: string } }> }>>;

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
  model: 'qwen/qwen3.6-27b',
  modelId: 'qwen-3.6-27b' as const,
  supportsImages: true,
  imageInputOrder: 'text-first' as const,
  sampling: { temperature: 0.6, topP: 0.95, maxCompletionTokens: 384 },
};

const FALLBACK_PROVIDER = {
  kind: 'openai' as const,
  label: 'legacy-fallback',
  apiKey: 'fallback-key',
  baseURL: 'https://fallback.example/v1',
  model: 'fallback-model',
  supportsImages: false,
  sampling: { temperature: 0.6, maxTokens: 384 },
};

const NVIDIA_VISION_PROVIDER = {
  kind: 'nvidia' as const,
  label: 'nvidia-minimax',
  apiKey: 'nvidia-key',
  baseURL: 'https://integrate.api.nvidia.com/v1',
  model: 'minimaxai/minimax-m3',
  modelId: 'minimax-m3' as const,
  supportsImages: true,
  imageInputOrder: 'text-first' as const,
  sampling: {
    temperature: 0.6,
    maxTokens: 384,
    extraBody: { chat_template_kwargs: { thinking_mode: 'disabled' } },
  },
};

function createChatRequest(signal?: AbortSignal, payload: Record<string, unknown> = {}): NextRequest {
  const body = JSON.stringify({ messages: [{ role: 'user', content: 'Tell me about your work' }], ...payload });
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

function createNvidiaStream(content: string) {
  return (async function* () {
    const splitAt = Math.max(1, Math.floor(content.length / 2));
    yield { choices: [{ delta: { content: content.slice(0, splitAt) } }] };
    yield { choices: [{ delta: { content: content.slice(splitAt) } }] };
  })();
}

describe('chat route provider payload mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChatProvidersMock.mockReturnValue({ primary: GROQ_PROVIDER, fallbacks: [] });
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
      max_completion_tokens: 384,
      temperature: 0.6,
      top_p: 0.95,
    });
  });

  it('starts the fallback within the shared deadline after the primary attempt budget', async () => {
    vi.useFakeTimers();
    getChatProvidersMock.mockReturnValue({ primary: GROQ_PROVIDER, fallbacks: [FALLBACK_PROVIDER] });
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
    await vi.advanceTimersByTimeAsync(74_999);
    expect(fallbackCreateMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    const response = await responsePromise;

    expect(fallbackCreateMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get('X-Chat-Fallback')).toBe('fallbackOnline');
    await expect(response.json()).resolves.toMatchObject({ reply: 'fallback reply' });
  });

  it('tries NVIDIA before the legacy provider after a Groq failure', async () => {
    const nvidiaFallback = { ...NVIDIA_VISION_PROVIDER, label: 'nvidia-fallback' };
    getChatProvidersMock.mockReturnValue({
      primary: GROQ_PROVIDER,
      fallbacks: [nvidiaFallback, FALLBACK_PROVIDER],
    });
    groqCreateMock.mockRejectedValue(new Error('Groq unavailable'));

    const nvidiaCreateMock = vi.fn(async () => createNvidiaStream('NVIDIA fallback reply'));
    const legacyCreateMock = vi.fn(async () => ({
      choices: [{ message: { content: 'legacy fallback reply' } }],
    }));
    createProviderClientMock.mockImplementation((provider: { label: string }) => ({
      chat: {
        completions: {
          create: provider.label === nvidiaFallback.label ? nvidiaCreateMock : legacyCreateMock,
        },
      },
    }));

    const response = await POST(createChatRequest());

    expect(nvidiaCreateMock).toHaveBeenCalledTimes(1);
    expect(legacyCreateMock).not.toHaveBeenCalled();
    expect(response.headers.get('X-Chat-Fallback')).toBe('fallbackOnline');
    await expect(response.json()).resolves.toMatchObject({ reply: 'NVIDIA fallback reply' });
  });

  it('skips text-only providers when an image request falls through the provider chain', async () => {
    getChatProvidersMock.mockReturnValue({
      primary: GROQ_PROVIDER,
      fallbacks: [FALLBACK_PROVIDER, NVIDIA_VISION_PROVIDER],
    });
    groqCreateMock.mockRejectedValue(new Error('Groq unavailable'));

    const nvidiaCreateMock = vi.fn(async () => createNvidiaStream('vision fallback reply'));
    createProviderClientMock.mockReturnValue({
      chat: { completions: { create: nvidiaCreateMock } },
    });

    const response = await POST(createChatRequest(undefined, {
      model: 'minimax-m3',
      image: { dataUrl: 'data:image/png;base64,aGVsbG8=' },
    }));

    expect(createProviderClientMock).toHaveBeenCalledTimes(1);
    expect(createProviderClientMock).toHaveBeenCalledWith(NVIDIA_VISION_PROVIDER);
    expect(nvidiaCreateMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get('X-Chat-Fallback')).toBe('fallbackOnline');
    await expect(response.json()).resolves.toMatchObject({ reply: 'vision fallback reply' });
  });

  it('keeps the image in the Groq Qwen payload using its documented text-first order', async () => {
    const response = await POST(createChatRequest(undefined, {
      image: { dataUrl: 'data:image/webp;base64,aGVsbG8=' },
    }));

    expect(response.status).toBe(200);
    const payload = groqCreateMock.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(payload.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'Tell me about your work' },
        { type: 'image_url', image_url: { url: 'data:image/webp;base64,aGVsbG8=' } },
      ],
    });
  });

  it('keeps the image in the MiniMax NVIDIA stream payload', async () => {
    getChatProvidersMock.mockReturnValue({ primary: NVIDIA_VISION_PROVIDER, fallbacks: [] });
    const nvidiaCreateMock = vi.fn<NvidiaStreamCreate>(async () => createNvidiaStream('vision reply'));
    createProviderClientMock.mockReturnValue({
      chat: { completions: { create: nvidiaCreateMock } },
    });

    const response = await POST(createChatRequest(undefined, {
      model: NVIDIA_VISION_PROVIDER.modelId,
      image: { dataUrl: 'data:image/jpeg;base64,aGVsbG8=' },
    }));

    expect(response.status).toBe(200);
    const payload = nvidiaCreateMock.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: unknown }>;
      stream: boolean;
    };
    expect(payload.stream).toBe(true);
    expect(payload.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'Tell me about your work' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,aGVsbG8=' } },
      ],
    });
  });

  it('skips a late invalid-response retry once the provider budget has under two seconds left', async () => {
    let now = 0;
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    groqCreateMock
      .mockImplementationOnce(async () => {
        now = 74_000;
        return { choices: [{ message: { content: '   ' } }] };
      });

    const response = await POST(createChatRequest());

    expect(groqCreateMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get('X-Chat-Fallback')).toBe('localStatic');
    expect(response.headers.get('X-Chat-Fallback-Reason')).toBe('invalid-provider-response');
    dateNowSpy.mockRestore();
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

  it('does not accept partial NVIDIA stream content after client cancellation', async () => {
    const requestController = new AbortController();
    getChatProvidersMock.mockReturnValue({ primary: NVIDIA_VISION_PROVIDER, fallbacks: [] });
    const nvidiaCreateMock = vi.fn<NvidiaStreamCreate>(async () => (async function* () {
      yield { choices: [{ delta: { content: 'partial reply' } }] };
      requestController.abort('client-cancelled');
    })());
    createProviderClientMock.mockReturnValue({
      chat: { completions: { create: nvidiaCreateMock } },
    });

    const response = await POST(createChatRequest(requestController.signal, {
      model: 'minimax-m3',
    }));

    expect(nvidiaCreateMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get('X-Chat-Fallback')).toBe('localStatic');
    expect(response.headers.get('X-Chat-Fallback-Reason')).toBe('request-aborted');
    await expect(response.json()).resolves.not.toMatchObject({ reply: 'partial reply' });
  });

  it('classifies the OpenAI SDK user-abort error as a provider timeout before using a fallback', async () => {
    getChatProvidersMock.mockReturnValue({ primary: NVIDIA_VISION_PROVIDER, fallbacks: [FALLBACK_PROVIDER] });
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const nvidiaCreateMock = vi.fn<NvidiaStreamCreate>(async () => {
      throw new OpenAI.APIUserAbortError();
    });
    const fallbackCreateMock = vi.fn(async () => ({
      choices: [{ message: { content: 'fallback reply' } }],
    }));
    createProviderClientMock.mockImplementation((provider: { label: string }) => ({
      chat: {
        completions: {
          create: provider.label === NVIDIA_VISION_PROVIDER.label ? nvidiaCreateMock : fallbackCreateMock,
        },
      },
    }));

    const response = await POST(createChatRequest(undefined, { model: 'minimax-m3' }));

    expect(warningSpy).toHaveBeenCalledWith('LLM provider failed', expect.objectContaining({
      code: 'provider-timeout',
      errorName: 'Error',
    }));
    expect(fallbackCreateMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get('X-Chat-Fallback')).toBe('fallbackOnline');
    await expect(response.json()).resolves.toMatchObject({ reply: 'fallback reply' });
  });

  it('reports a safe provider-timeout fallback reason when every attempted provider times out', async () => {
    getChatProvidersMock.mockReturnValue({ primary: NVIDIA_VISION_PROVIDER, fallbacks: [] });
    const nvidiaCreateMock = vi.fn<NvidiaStreamCreate>(async () => {
      throw new OpenAI.APIUserAbortError();
    });
    createProviderClientMock.mockReturnValue({
      chat: { completions: { create: nvidiaCreateMock } },
    });

    const response = await POST(createChatRequest(undefined, { model: 'minimax-m3' }));

    expect(response.headers.get('X-Chat-Fallback')).toBe('localStatic');
    expect(response.headers.get('X-Chat-Fallback-Reason')).toBe('provider-timeout');
  });

  it('reports a safe invalid-provider-response fallback reason when every response is empty', async () => {
    groqCreateMock.mockResolvedValue({ choices: [{ message: { content: '   ' } }] });

    const response = await POST(createChatRequest());

    expect(response.headers.get('X-Chat-Fallback')).toBe('localStatic');
    expect(response.headers.get('X-Chat-Fallback-Reason')).toBe('invalid-provider-response');
  });

  it('does not expose raw provider errors in the fallback reason header', async () => {
    groqCreateMock.mockRejectedValue(new Error('upstream secret detail\r\napi-key-value'));

    const response = await POST(createChatRequest());

    expect(response.headers.get('X-Chat-Fallback-Reason')).toBe('all-providers-failed');
    expect(response.headers.get('X-Chat-Fallback-Reason')).not.toContain('secret');
  });

  it('rejects unknown model IDs and invalid or oversized image data URLs before provider calls', async () => {
    const unknownModel = await POST(createChatRequest(undefined, { model: 'llama-3.1-8b-instant' }));
    const invalidImage = await POST(createChatRequest(undefined, { image: { dataUrl: 'https://example.com/image.png' } }));
    const oversizedImage = await POST(createChatRequest(undefined, {
      image: { dataUrl: `data:image/png;base64,${Buffer.alloc(180 * 1024 + 1).toString('base64')}` },
    }));

    expect(unknownModel.status).toBe(400);
    expect(invalidImage.status).toBe(400);
    expect(oversizedImage.status).toBe(400);
    expect(groqCreateMock).not.toHaveBeenCalled();
  });

  it('rejects images for a text-only model', async () => {
    const response = await POST(createChatRequest(undefined, {
      model: 'nemotron-3-super-120b-a12b',
      image: { dataUrl: 'data:image/png;base64,aGVsbG8=' },
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'The selected model does not support images' });
    expect(groqCreateMock).not.toHaveBeenCalled();
  });

});
