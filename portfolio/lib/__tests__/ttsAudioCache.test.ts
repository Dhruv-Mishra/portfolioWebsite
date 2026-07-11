import { describe, expect, it } from 'vitest';

import {
  createTtsAudioCacheKey,
  getTtsAudioCacheEvictionKeys,
  MAX_TTS_AUDIO_CACHE_BYTES,
  MAX_TTS_AUDIO_CACHE_RECORDS,
} from '@/lib/ttsAudioCache';

describe('TTS audio cache budget', () => {
  it('separates generated audio by the server reference revision', () => {
    const options = { provider: 'pocket-tts', speed: 1, voice: 'custom-dhruv' } as const;

    expect(createTtsAudioCacheKey('Hello', { ...options, voiceRevision: 'a'.repeat(64) }))
      .not.toBe(createTtsAudioCacheKey('Hello', { ...options, voiceRevision: 'b'.repeat(64) }));
  });

  it('evicts least-recently-used records until both budgets are met', () => {
    const records = Array.from({ length: MAX_TTS_AUDIO_CACHE_RECORDS + 2 }, (_, index) => ({
      byteLength: 1,
      cacheKey: `record-${index}`,
      lastAccessedAt: index,
    }));
    records[0].byteLength = MAX_TTS_AUDIO_CACHE_BYTES;

    expect(getTtsAudioCacheEvictionKeys(records, 'record-33')).toEqual(['record-0', 'record-1']);
  });

  it('removes a just-written record when it alone exceeds the byte budget', () => {
    expect(getTtsAudioCacheEvictionKeys([{
      byteLength: MAX_TTS_AUDIO_CACHE_BYTES + 1,
      cacheKey: 'oversized',
      lastAccessedAt: 1,
    }], 'oversized')).toEqual(['oversized']);
  });
});