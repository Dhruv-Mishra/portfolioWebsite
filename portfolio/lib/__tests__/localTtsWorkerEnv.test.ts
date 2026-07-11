import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWorkerEnv, getLocalTtsSettings } from '@/lib/localTts.server';

describe('local TTS worker environment', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('enables Hugging Face offline mode when local offline mode is enabled', () => {
    vi.stubEnv('LOCAL_TTS_OFFLINE', '1');
    vi.stubEnv('HF_HUB_OFFLINE', undefined);

    expect(createWorkerEnv(getLocalTtsSettings()).HF_HUB_OFFLINE).toBe('1');
  });

  it('makes the local offline switch authoritative', () => {
    vi.stubEnv('LOCAL_TTS_OFFLINE', '1');
    vi.stubEnv('HF_HUB_OFFLINE', '0');

    expect(createWorkerEnv(getLocalTtsSettings()).HF_HUB_OFFLINE).toBe('1');
  });
});