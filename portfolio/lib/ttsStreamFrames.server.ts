import { gzipSync } from 'node:zlib';

const TTS_GZIP_METADATA_OVERHEAD_BYTES = 64;
const TTS_GZIP_MINIMUM_SAVINGS_RATIO = 0.1;

export interface TtsStreamAudioFrame {
  audioBase64: string;
  compression: 'gzip' | 'none';
  uncompressedBytes?: number;
}

export function acceptsTtsFrameGzip(request: Request): boolean {
  return request.headers.get('x-tts-accept-compression') === 'gzip';
}

export function createTtsStreamAudioFrame(audio: Buffer, acceptsGzip: boolean): TtsStreamAudioFrame {
  if (!acceptsGzip) {
    return { audioBase64: audio.toString('base64'), compression: 'none' };
  }

  const compressed = gzipSync(audio, { level: 1 });
  const maximumCompressedBytes = audio.length * (1 - TTS_GZIP_MINIMUM_SAVINGS_RATIO);
  if (compressed.length + TTS_GZIP_METADATA_OVERHEAD_BYTES > maximumCompressedBytes) {
    return { audioBase64: audio.toString('base64'), compression: 'none' };
  }

  return {
    audioBase64: compressed.toString('base64'),
    compression: 'gzip',
    uncompressedBytes: audio.length,
  };
}