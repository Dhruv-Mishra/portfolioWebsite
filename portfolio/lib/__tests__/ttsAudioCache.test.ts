import { describe, expect, it } from 'vitest';

import {
  getTtsAudioCacheEvictionKeys,
  MAX_TTS_AUDIO_CACHE_BYTES,
  MAX_TTS_AUDIO_CACHE_RECORDS,
} from '@/lib/ttsAudioCache';

describe('TTS audio cache budget', () => {
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