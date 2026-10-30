import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mintVoiceSessionMock = vi.hoisted(() => vi.fn());
const consoleErrorMock = vi.hoisted(() => vi.fn());
const getRelevantFactContextMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/serverRateLimit', () => ({
  createServerRateLimiter: vi.fn(() => ({
    check: vi.fn(() => ({ limited: false, retryAfter: 0 })),
  })),
  getClientIP: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/validateOrigin', () => ({
  validateOrigin: vi.fn(() => null),
}));

vi.mock('@/lib/voiceSession.server', () => ({
  mintVoiceSession: mintVoiceSessionMock,
}));

vi.mock('@/lib/factRetrieval.server', () => ({
  getRelevantFactContext: getRelevantFactContextMock,
}));

import { POST } from '@/app/api/voice/session/route';
import { POST as factsPOST } from '@/app/api/voice/facts/route';

function sessionRequest(body: Record<string, unknown>, signal?: AbortSignal): NextRequest {
  const payload = JSON.stringify(body);
  return new Request('https://whoisdhruv.com/api/voice/session', {
    method: 'POST',
    headers: {
      origin: 'https://whoisdhruv.com',
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(payload)),
    },
    body: payload,
    signal,
  }) as unknown as NextRequest;
}

describe('/api/voice/session', () => {
  beforeEach(() => {
    mintVoiceSessionMock.mockReset();
    mintVoiceSessionMock.mockResolvedValue({
      token: 'token-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      newSessionExpiresAt: '2099-01-01T00:01:00.000Z',
      setup: {
        modelLabel: 'native-live',
        voiceLabel: 'male',
        inputSampleRate: 16_000,
        outputSampleRate: 24_000,
        greetOnConnect: true,
        lowNetwork: false,
        welcomeGreeting: 'Welcome.',
        welcomeHint: 'Try saying open projects.',
      },
    });
    consoleErrorMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(consoleErrorMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards low-network and snapshot context when minting a session', async () => {
    const response = await POST(sessionRequest({
      lowNetwork: true,
      snapshot: { route: '/projects' },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ token: 'token-1' });
    expect(mintVoiceSessionMock).toHaveBeenCalledWith({
      lowNetwork: true,
      snapshot: expect.objectContaining({ route: '/projects' }),
    });
    expect(consoleErrorMock).not.toHaveBeenCalled();
  });
});

describe.each([
  ['facts', factsPOST],
  ['session', POST],
] as const)('/api/voice/%s body errors', (_name, handler) => {
  beforeEach(() => {
    mintVoiceSessionMock.mockClear();
    getRelevantFactContextMock.mockClear();
  });

  it('returns 400 when the request was aborted before its body was read', async () => {
    const controller = new AbortController();
    controller.abort();

    const response = await handler(sessionRequest({}, controller.signal));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid JSON body' });
    expect(mintVoiceSessionMock).not.toHaveBeenCalled();
    expect(getRelevantFactContextMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the body stream fails', async () => {
    const request = new Request('https://whoisdhruv.com/api/voice/test', {
      method: 'POST',
      headers: { 'content-length': '2' },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error('Connection lost'));
        },
      }),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }) as unknown as NextRequest;

    const response = await handler(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid JSON body' });
    expect(mintVoiceSessionMock).not.toHaveBeenCalled();
    expect(getRelevantFactContextMock).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, '{}', 411],
    ['2049', '{}', 413],
    ['1', '{', 400],
    ['2', '[]', 400],
    ['4', 'null', 400],
  ] as const)('preserves validation status %s / %s -> %s', async (contentLength, body, status) => {
    const request = new Request('https://whoisdhruv.com/api/voice/test', {
      method: 'POST',
      headers: contentLength === undefined ? undefined : { 'content-length': contentLength },
      body,
    }) as unknown as NextRequest;

    const response = await handler(request);

    expect(response.status).toBe(status);
    expect(mintVoiceSessionMock).not.toHaveBeenCalled();
    expect(getRelevantFactContextMock).not.toHaveBeenCalled();
  });
});
