import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/feedback/route';
import { GITHUB_API_TIMEOUT_MS } from '@/lib/llmConfig';
import { LAYOUT_TOKENS } from '@/lib/designTokens';

vi.mock('@/lib/serverRateLimit', () => ({
  createServerRateLimiter: () => ({ check: () => ({ limited: false }) }),
  getClientIP: () => '192.0.2.10',
}));

const fetchMock = vi.fn<typeof fetch>();
function request(body: Record<string, unknown>) {
  const json = JSON.stringify({ category: 'idea', message: 'A helpful idea', ...body });
  return new NextRequest('https://whoisdhruv.com/api/feedback', {
    method: 'POST',
    headers: {
      origin: 'https://whoisdhruv.com',
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(json)),
    },
    body: json,
  });
}

beforeEach(() => {
  vi.stubEnv('GITHUB_FEEDBACK_TOKEN', 'test-token');
  vi.stubEnv('GITHUB_FEEDBACK_REPO', 'owner/feedback');
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fetchMock.mockReset().mockResolvedValue(Response.json({ number: 12 }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('feedback validation', () => {
  it.each([
    { message: {} }, { message: ['hello'] }, { message: 12345 }, { message: null },
    { contact: {} }, { contact: ['handle'] }, { contact: 12345 }, { contact: null },
    { message: 'x'.repeat(LAYOUT_TOKENS.maxMessageLength + 1) },
    { contact: 'x'.repeat(LAYOUT_TOKENS.contactMaxLength + 1) },
  ])('rejects malformed or oversized fields: %j', async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty('error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts strings at their limits without truncating them', async () => {
    const message = 'x'.repeat(LAYOUT_TOKENS.maxMessageLength);
    const contact = 'y'.repeat(LAYOUT_TOKENS.contactMaxLength);
    expect((await POST(request({ message, contact }))).status).toBe(200);
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { body: string };
    expect(payload.body).toContain(message);
    expect(payload.body).toContain(`**Contact:** ${contact}`);
  });

  it('accepts omitted optional contact', async () => {
    expect((await POST(request({}))).status).toBe(200);
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { body: string };
    expect(payload.body).not.toContain('**Contact:**');
  });
});

describe('feedback deadline covers response bodies', () => {
  it.each([true, false])('keeps the abort timer through the %s-success response body', async (ok) => {
    vi.useFakeTimers();
    let bodyStarted!: () => void;
    const started = new Promise<void>((resolve) => { bodyStarted = resolve; });
    fetchMock.mockImplementation(async (_url, init) => {
      const readBody = () => new Promise<never>((_resolve, reject) => {
        bodyStarted();
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
      return { ok, status: ok ? 201 : 500, json: readBody, text: readBody } as unknown as Response;
    });
    const pending = POST(request({}));
    await started;
    await vi.advanceTimersByTimeAsync(GITHUB_API_TIMEOUT_MS);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: expect.stringMatching(/try again/i) });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the deadline after a successful body read', async () => {
    vi.useFakeTimers();
    const response = await POST(request({}));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, issueNumber: 12 });
    expect(vi.getTimerCount()).toBe(0);
  });
});
