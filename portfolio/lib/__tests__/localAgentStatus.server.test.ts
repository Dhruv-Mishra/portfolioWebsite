import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  __resetLocalAgentStatusCacheForTest,
  deriveLocalAgentStatusUrls,
  getLocalAgentStatus,
} from '@/lib/localAgentStatus.server';
import { GET } from '@/app/api/chat/local-status/route';

afterEach(() => {
  __resetLocalAgentStatusCacheForTest();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('local agent status', () => {
  it('derives health and models URLs from root and OpenAI-compatible bases', () => {
    expect(deriveLocalAgentStatusUrls('https://llm.example')).toEqual({
      healthUrl: 'https://llm.example/health',
      modelsUrl: 'https://llm.example/v1/models',
    });
    expect(deriveLocalAgentStatusUrls('https://llm.example/v1/')).toEqual({
      healthUrl: 'https://llm.example/health',
      modelsUrl: 'https://llm.example/v1/models',
    });
  });

  it('checks health before authenticated discovery and caches coalesced results', async () => {
    vi.stubEnv('LOCAL_AGENT_BASE_URL', 'https://llm.example/v1');
    vi.stubEnv('LOCAL_AGENT_API_KEY', 'local-key');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'gemma-4-e2b-phone' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([getLocalAgentStatus(), getLocalAgentStatus()]);
    const third = await getLocalAgentStatus();

    expect(first).toEqual({ healthy: true, modelName: 'gemma-4-e2b-phone' });
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
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getLocalAgentStatus()).resolves.toEqual({ healthy: false, modelName: 'Local model' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    __resetLocalAgentStatusCacheForTest();
    fetchMock.mockReset()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: '' }] }));

    await expect(getLocalAgentStatus()).resolves.toEqual({ healthy: false, modelName: 'Local model' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns only the cacheable public status from the route', async () => {
    vi.stubEnv('LOCAL_AGENT_BASE_URL', '');
    vi.stubEnv('LOCAL_AGENT_API_KEY', '');

    const response = await GET();

    expect(response.headers.get('cache-control')).toBe('private, max-age=300');
    await expect(response.json()).resolves.toEqual({ healthy: false, modelName: 'Local model' });
  });
});