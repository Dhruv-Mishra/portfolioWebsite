import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWorkerEnv, getLocalTtsSettings } from '@/lib/localTts.server';

describe('local TTS worker environment', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('keeps the model cache separate from Hugging Face credentials', () => {
    vi.stubEnv('HF_HOME', undefined);
    vi.stubEnv('HF_HUB_CACHE', undefined);

    const settings = getLocalTtsSettings();
    const environment = createWorkerEnv(settings);

    expect(environment.HF_HUB_CACHE).toBe(settings.cacheDir);
    expect(environment.HF_HOME).toBeUndefined();
  });

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

  it('forwards the resolved explicit reference path to the worker', () => {
    vi.stubEnv('LOCAL_TTS_REFERENCE_PATH', 'tmp/custom-reference.mp3');

    const settings = getLocalTtsSettings();
    expect(settings.referencePath).toMatch(/tmp[\\/]custom-reference\.mp3$/);
    expect(createWorkerEnv(settings).LOCAL_TTS_REFERENCE_PATH).toBe(settings.referencePath);
  });
});