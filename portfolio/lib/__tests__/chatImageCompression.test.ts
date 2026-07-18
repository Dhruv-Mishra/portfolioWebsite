import { describe, expect, it } from 'vitest';

import {
  CHAT_IMAGE_MAX_DIMENSION,
  CHAT_IMAGE_MAX_RAW_BYTES,
  fitChatImageDimensions,
  getDataUrlDecodedByteLength,
  isSupportedChatImageType,
} from '@/lib/chatImageCompression';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'lib', 'chatImageCompression.ts'),
  'utf8',
);

describe('chat image compression helpers', () => {
  it('allows only the client and server-supported image MIME types', () => {
    expect(isSupportedChatImageType('image/jpeg')).toBe(true);
    expect(isSupportedChatImageType('image/png')).toBe(true);
    expect(isSupportedChatImageType('image/webp')).toBe(true);
    expect(isSupportedChatImageType('image/gif')).toBe(false);
    expect(CHAT_IMAGE_MAX_RAW_BYTES).toBe(10 * 1024 * 1024);
  });

  it('calculates data URL bytes and constrains image dimensions proportionally', () => {
    expect(getDataUrlDecodedByteLength('data:image/jpeg;base64,QUJD')).toBe(3);
    expect(getDataUrlDecodedByteLength('data:image/jpeg;base64,QQ==')).toBe(1);
    expect(fitChatImageDimensions({ width: 3200, height: 800 })).toEqual({
      width: CHAT_IMAGE_MAX_DIMENSION,
      height: 400,
    });
  });

  it('uses abortable asynchronous blob encoding and releases fallback object URLs on decode failure', () => {
    expect(source).toContain('compressChatImage(file: File, signal?: AbortSignal)');
    expect(source).toContain('canvas.toBlob(');
    expect(source).toContain('blobToDataUrl(blob, signal)');
    expect(source).toContain('throwIfAborted(signal);');
    expect(source).toContain('URL.revokeObjectURL(objectUrl);');
  });
});