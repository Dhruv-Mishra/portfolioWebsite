import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mintVoiceSessionMock = vi.hoisted(() => vi.fn());
const consoleErrorMock = vi.hoisted(() => vi.fn());

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

import { POST } from '@/app/api/voice/session/route';

function sessionRequest(body: Record<string, unknown>): NextRequest {
  const payload = JSON.stringify(body);
  return new Request('https://whoisdhruv.com/api/voice/session', {
    method: 'POST',
    headers: {
      origin: 'https://whoisdhruv.com',
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(payload)),
    },
    body: payload,
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
