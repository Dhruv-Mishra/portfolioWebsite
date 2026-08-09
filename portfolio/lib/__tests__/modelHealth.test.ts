import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  __resetModelHealthCacheForTest,
  getModelHealthAdvisory,
  parseModelHealthSnapshot,
} from '@/lib/modelHealth.server';

const NOW = Date.parse('2026-08-09T00:00:00.000Z');

function createSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    environment: 'staging',
    generatedAt: '2026-08-09T00:00:00.000Z',
    expiresAt: '2026-08-09T00:20:00.000Z',
    probeMode: 'canary',
    source: {
      workflow: 'publish-model-health',
      runId: '123456',
      site: 'staging.whoisdhruv.com',
    },
    models: [{
      id: 'qwen-3.6-27b',
      state: 'degraded',
      checkedAt: '2026-08-09T00:00:00.000Z',
      latencyMs: 1_200,
      consecutiveFailures: 1,
      failureCode: 'static_fallback',
    }],
    ...overrides,
  };
}

function toContentsResponse(snapshot: unknown): Response {
  return Response.json({
    content: Buffer.from(JSON.stringify(snapshot), 'utf8').toString('base64'),
    encoding: 'base64',
  });
}

afterEach(() => {
  __resetModelHealthCacheForTest();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('model health snapshots', () => {
  it('returns only the fresh, public model advisory shape from a strict v1 snapshot', () => {
    expect(parseModelHealthSnapshot(createSnapshot(), 'staging', NOW)).toEqual({
      expiresAt: '2026-08-09T00:20:00.000Z',
      models: [{ id: 'qwen-3.6-27b', state: 'degraded' }],
    });
  });

  it('rejects stale, malformed, and unexpected snapshot data', () => {
    expect(parseModelHealthSnapshot(createSnapshot({ expiresAt: '2026-08-08T23:59:59.000Z' }), 'staging', NOW)).toBeNull();
    expect(parseModelHealthSnapshot(createSnapshot({ environment: 'production' }), 'staging', NOW)).toBeNull();
    expect(parseModelHealthSnapshot(createSnapshot({ source: { workflow: 'other', runId: '1', site: 'example.com' } }), 'staging', NOW)).toBeNull();
    expect(parseModelHealthSnapshot(createSnapshot({ unexpected: 'raw provider payload' }), 'staging', NOW)).toBeNull();
  });

  it('fails open when advisory configuration is absent', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(getModelHealthAdvisory()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads the configured snapshot once for concurrent callers and caches the safe result', async () => {
    vi.stubEnv('GITHUB_MODEL_HEALTH_REPO', 'Dhruv-Mishra/portfolio-model-health');
    vi.stubEnv('GITHUB_MODEL_HEALTH_TOKEN', 'test-token');
    vi.stubEnv('MODEL_HEALTH_ENVIRONMENT', 'staging');
    const fetchMock = vi.fn().mockResolvedValue(toContentsResponse(createSnapshot()));
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([getModelHealthAdvisory(), getModelHealthAdvisory()]);

    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/Dhruv-Mishra/portfolio-model-health/contents/status/v1/staging.json',
      expect.objectContaining({ cache: 'no-store' }),
    );
    await expect(getModelHealthAdvisory()).resolves.toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});