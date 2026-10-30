import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  __resetLocalAgentStatusCacheForTest,
  deriveLocalAgentUrls,
  deriveLocalAgentStatusUrls,
  getLocalAgentStatus,
} from '@/lib/localAgentStatus.server';
import type { NextRequest } from 'next/server';
import { GET } from '@/app/api/chat/local-status/route';

function statusRequest(): NextRequest {
  return new Request('http://localhost/api/chat/local-status') as unknown as NextRequest;
}

afterEach(() => {
  __resetLocalAgentStatusCacheForTest();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('local agent status', () => {
  it('derives canonical provider, health, and models URLs from root and OpenAI-compatible bases', () => {
    expect(deriveLocalAgentUrls('https://llm.example')).toEqual({
      providerBaseUrl: 'https://llm.example/v1',
      healthUrl: 'https://llm.example/health',
      modelsUrl: 'https://llm.example/v1/models',
    });
    expect(deriveLocalAgentUrls('https://llm.example/v1/')).toEqual({
      providerBaseUrl: 'https://llm.example/v1',
      healthUrl: 'https://llm.example/health',
      modelsUrl: 'https://llm.example/v1/models',
    });
    expect(deriveLocalAgentUrls('https://llm.example/llm?discard=true#fragment')).toEqual({
      providerBaseUrl: 'https://llm.example/llm/v1',
      healthUrl: 'https://llm.example/llm/health',
      modelsUrl: 'https://llm.example/llm/v1/models',
    });
    expect(deriveLocalAgentUrls('https://llm.example/llm/v1')).toEqual({
      providerBaseUrl: 'https://llm.example/llm/v1',
      healthUrl: 'https://llm.example/llm/health',
      modelsUrl: 'https://llm.example/llm/v1/models',
    });

    expect(deriveLocalAgentStatusUrls('https://llm.example')).toEqual({
      healthUrl: 'https://llm.example/health',
      modelsUrl: 'https://llm.example/v1/models',
    });
    expect(deriveLocalAgentStatusUrls('https://llm.example/v1/')).toEqual({
      healthUrl: 'https://llm.example/health',
      modelsUrl: 'https://llm.example/v1/models',
    });
  });

  it.each([
    'ftp://llm.example',
    'https://local-agent-key@llm.example',
    'not a URL',
    `https://llm.example/${'a'.repeat(2_048)}`,
  ])('rejects unsafe or invalid base URL %s', (baseUrl) => {
    expect(() => deriveLocalAgentUrls(baseUrl)).toThrow('Invalid local agent base URL');
  });

  it('checks health and discovery concurrently and caches coalesced results', async () => {
    vi.stubEnv('LOCAL_AGENT_BASE_URL', 'https://llm.example/v1');
    vi.stubEnv('LOCAL_AGENT_API_KEY', 'local-key');
    let resolveHealth!: (response: Response) => void;
    const healthResponse = new Promise<Response>((resolve) => {
      resolveHealth = resolve;
    });
    const fetchMock = vi.fn()
      .mockReturnValueOnce(healthResponse)
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'LFM3-1.7B' }, { id: '' }, { id: 'LFM3-Omni-2B' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const requests = [getLocalAgentStatus(), getLocalAgentStatus()];
    const probesStarted = fetchMock.mock.calls.length;
    resolveHealth(new Response(null, { status: 204 }));
    const [first, second] = await Promise.all(requests);
    const third = await getLocalAgentStatus();

    expect(probesStarted).toBe(2);
    expect(first).toEqual({ healthy: true, modelName: 'LFM3-1.7B', models: ['LFM3-1.7B', 'LFM3-Omni-2B'] });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]).toEqual([
      'https://llm.example/health',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    ]);
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('headers');
    expect(fetchMock.mock.calls[1]).toEqual([
      'https://llm.example/v1/models',
      expect.objectContaining({
        cache: 'no-store',
        headers: { Authorization: 'Bearer local-key' },
        signal: expect.any(AbortSignal),
      }),
    ]);
  });

  it('returns the sanitized fallback when health is down or discovery is malformed', async () => {
    vi.stubEnv('LOCAL_AGENT_BASE_URL', 'https://llm.example');
    vi.stubEnv('LOCAL_AGENT_API_KEY', 'local-key');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'LFM3-1.7B' }] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getLocalAgentStatus()).resolves.toEqual({ healthy: false, modelName: 'Local model', models: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    __resetLocalAgentStatusCacheForTest();
    fetchMock.mockReset()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: '' }] }));

    await expect(getLocalAgentStatus()).resolves.toEqual({ healthy: false, modelName: 'Local model', models: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns fallback when discovery fails while health is still pending', async () => {
    vi.stubEnv('LOCAL_AGENT_BASE_URL', 'https://llm.example');
    vi.stubEnv('LOCAL_AGENT_API_KEY', 'local-key');
    let resolveHealth!: (response: Response) => void;
    const healthRequest = new Promise<Response>((resolve) => {
      resolveHealth = resolve;
    });
    const fetchMock = vi.fn()
      .mockReturnValueOnce(healthRequest)
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      await expect(getLocalAgentStatus()).resolves.toEqual({ healthy: false, modelName: 'Local model', models: [] });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      resolveHealth(new Response(null, { status: 204 }));
    }
  });

  it('rechecks health immediately when force is requested after a cached result', async () => {
    vi.stubEnv('LOCAL_AGENT_BASE_URL', 'https://llm.example/v1');
    vi.stubEnv('LOCAL_AGENT_API_KEY', 'local-key');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'gemma-4-e2b-phone' }] }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'gemma-4-e2b-phone' }] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getLocalAgentStatus()).resolves.toEqual({ healthy: true, modelName: 'gemma-4-e2b-phone', models: ['gemma-4-e2b-phone'] });
    await expect(getLocalAgentStatus({ force: true })).resolves.toEqual({ healthy: false, modelName: 'Local model', models: [] });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('returns only the cacheable public status from the route', async () => {
    vi.stubEnv('LOCAL_AGENT_BASE_URL', '');
    vi.stubEnv('LOCAL_AGENT_API_KEY', '');

    const response = await GET(statusRequest());

    expect(response.headers.get('cache-control')).toBe('private, max-age=300');
    await expect(response.json()).resolves.toEqual({ healthy: false, modelName: 'Local model', models: [] });
  });
});