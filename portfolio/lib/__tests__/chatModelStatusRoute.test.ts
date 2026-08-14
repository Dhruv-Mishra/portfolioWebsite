import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NextRequest } from 'next/server';
import { GET } from '@/app/api/chat/model-status/route';
import { __resetLocalAgentStatusCacheForTest, getLocalAgentStatus } from '@/lib/localAgentStatus.server';
import { __resetModelHealthCacheForTest } from '@/lib/modelHealth.server';

function statusRequest(search = ''): NextRequest {
  return new Request(`http://localhost/api/chat/model-status${search}`) as unknown as NextRequest;
}

const routeSource = fs.readFileSync(
  path.join(process.cwd(), 'app', 'api', 'chat', 'model-status', 'route.ts'),
  'utf8',
);

afterEach(() => {
  __resetLocalAgentStatusCacheForTest();
  __resetModelHealthCacheForTest();
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

    const response = await GET(statusRequest());

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
      advisoryHealth: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechecks live local-agent health when fresh=1 is requested', async () => {
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('NVIDIA_API_KEY', 'nvidia-key');
    vi.stubEnv('LOCAL_AGENT_BASE_URL', 'https://llm.example/v1');
    vi.stubEnv('LOCAL_AGENT_API_KEY', 'local-agent-key');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'gemma-4-e2b-phone' }] }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    await getLocalAgentStatus();
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

    const response = await GET(statusRequest('?fresh=1'));
    const body = await response.json() as { localModelStatus: { healthy: boolean; modelName: string } };

    expect(body.localModelStatus).toEqual({ healthy: false, modelName: 'Local model' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('exposes only the safe advisory shape and never reader configuration or snapshot internals', async () => {
    vi.stubEnv('GITHUB_MODEL_HEALTH_REPO', 'Dhruv-Mishra/portfolio-model-health');
    vi.stubEnv('GITHUB_MODEL_HEALTH_TOKEN', 'top-secret-token');
    vi.stubEnv('MODEL_HEALTH_ENVIRONMENT', 'staging');
    const snapshot = {
      schemaVersion: 1,
      environment: 'staging',
      generatedAt: '2099-08-09T00:00:00.000Z',
      expiresAt: '2099-08-09T00:20:00.000Z',
      probeMode: 'canary',
      source: { workflow: 'publish-model-health', runId: '123456', site: 'staging.whoisdhruv.com' },
      models: [{
        id: 'qwen-3.6-27b',
        state: 'degraded',
        checkedAt: '2099-08-09T00:00:00.000Z',
        latencyMs: 1_200,
        consecutiveFailures: 1,
        failureCode: 'static_fallback',
      }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      content: Buffer.from(JSON.stringify(snapshot), 'utf8').toString('base64'),
      encoding: 'base64',
    })));

    const body = await (await GET(statusRequest())).json() as Record<string, unknown>;
    const serializedBody = JSON.stringify(body);

    expect(body.advisoryHealth).toEqual({
      expiresAt: '2099-08-09T00:20:00.000Z',
      models: [{ id: 'qwen-3.6-27b', state: 'degraded' }],
    });
    expect(serializedBody).not.toContain('top-secret-token');
    expect(serializedBody).not.toContain('Dhruv-Mishra/portfolio-model-health');
    expect(serializedBody).not.toContain('failureCode');
    expect(serializedBody).not.toContain('source');
  });

  it('keeps model-status read-only and delegates GitHub access to the server-only reader', () => {
    expect(routeSource).toContain("import { getModelHealthAdvisory } from '@/lib/modelHealth.server';");
    expect(routeSource).toContain('advisoryHealth: await getModelHealthAdvisory()');
    expect(routeSource).not.toContain('GITHUB_MODEL_HEALTH_TOKEN');
    expect(routeSource).not.toContain('method: \'PUT\'');
  });
});