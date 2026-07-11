import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { acceptsTtsFrameGzip, createTtsStreamAudioFrame } from '@/lib/ttsStreamFrames.server';

describe('/api/tts adaptive frame compression', () => {
  it('only negotiates the exact gzip capability token', () => {
    expect(acceptsTtsFrameGzip(new Request('http://localhost/api/tts', {
      headers: { 'X-TTS-Accept-Compression': 'gzip' },
    }))).toBe(true);
    expect(acceptsTtsFrameGzip(new Request('http://localhost/api/tts', {
      headers: { 'X-TTS-Accept-Compression': 'br, gzip' },
    }))).toBe(false);
  });

  it('uses gzip only when one PCM frame clears the savings threshold', () => {
    const silence = Buffer.alloc(24_000);
    const compressed = createTtsStreamAudioFrame(silence, true);

    expect(compressed.compression).toBe('gzip');
    expect(compressed.uncompressedBytes).toBe(silence.length);
    expect(gunzipSync(Buffer.from(compressed.audioBase64, 'base64'))).toEqual(silence);

    const raw = createTtsStreamAudioFrame(Buffer.from('small pcm frame'), true);
    expect(raw).toMatchObject({
      audioBase64: Buffer.from('small pcm frame').toString('base64'),
      compression: 'none',
    });
  });
});