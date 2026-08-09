import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/chat/model-status/route';
import { __resetLocalAgentStatusCacheForTest, getLocalAgentStatus } from '@/lib/localAgentStatus.server';

afterEach(() => {
  __resetLocalAgentStatusCacheForTest();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('chat model status route', () => {
  it('returns the public configured model catalog and cached local status without external calls', async () => {
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('NVIDIA_API_KEY', 'nvidia-key');
    vi.stubEnv('LOCAL_AGENT_BASE_URL', 'https://llm.example/v1');
    vi.stubEnv('LOCAL_AGENT_API_KEY', 'local-agent-key');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'gemma-4-e2b-phone' }] }));
    vi.stubGlobal('fetch', fetchMock);
    await getLocalAgentStatus();
    fetchMock.mockClear();

    const response = GET();

    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      models: [
        { id: 'qwen-3.6-27b', provider: 'groq', available: true },
        { id: 'minimax-m3', provider: 'nvidia', available: true },
        { id: 'deepseek-v4-flash', provider: 'nvidia', available: true },
        { id: 'nemotron-3-super-120b-a12b', provider: 'nvidia', available: true },
        { id: 'qwen-3.5-4b-local', provider: 'local', available: true },
      ],
      deploymentCanaryModelIds: ['qwen-3.6-27b', 'minimax-m3', 'qwen-3.5-4b-local'],
      localModelStatus: { healthy: true, modelName: 'gemma-4-e2b-phone' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});