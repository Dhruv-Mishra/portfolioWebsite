import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CHAT_IMAGE_MAX_ENCODED_BYTES,
  CHAT_IMAGE_MAX_DIMENSION,
  CHAT_IMAGE_MAX_RAW_BYTES,
  compressChatImage,
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('chat image compression helpers', () => {
  it('allows only the client and server-supported image MIME types', () => {
    expect(isSupportedChatImageType('image/jpeg')).toBe(true);
    expect(isSupportedChatImageType('image/png')).toBe(true);
    expect(isSupportedChatImageType('image/webp')).toBe(true);
    expect(isSupportedChatImageType('image/gif')).toBe(false);
    expect(CHAT_IMAGE_MAX_RAW_BYTES).toBe(10 * 1024 * 1024);
    expect(CHAT_IMAGE_MAX_ENCODED_BYTES).toBe(128 * 1024);
    expect(CHAT_IMAGE_MAX_DIMENSION).toBe(1280);
  });

  it('calculates data URL bytes and constrains image dimensions proportionally', () => {
    expect(getDataUrlDecodedByteLength('data:image/jpeg;base64,QUJD')).toBe(3);
    expect(getDataUrlDecodedByteLength('data:image/jpeg;base64,QQ==')).toBe(1);
    expect(fitChatImageDimensions({ width: 3200, height: 800 })).toEqual({
      width: CHAT_IMAGE_MAX_DIMENSION,
      height: 320,
    });
  });

  it('uses abortable asynchronous blob encoding and releases fallback object URLs on decode failure', () => {
    expect(source).toContain('compressChatImage(file: File, signal?: AbortSignal)');
    expect(source).toContain('canvas.toBlob(');
    expect(source).toContain('blobToDataUrl(blob, signal)');
    expect(source).toContain('throwIfAborted(signal);');
    expect(source).toContain('URL.revokeObjectURL(objectUrl);');
    expect(source).toContain("context.imageSmoothingQuality = 'high'");
    expect(source).toContain('const CHAT_IMAGE_JPEG_QUALITIES = [0.84, 0.76, 0.68, 0.6]');
  });

  it('falls back from bitmap decoding and progressively downscales without dropping below the quality floor', async () => {
    const createObjectURL = vi.fn(() => 'blob:test-image');
    const revokeObjectURL = vi.fn();
    const drawImage = vi.fn();
    const encodedSizes = [
      160, 150, 140, 130,
      127,
    ].map(kib => kib * 1024);
    const toBlob = vi.fn((callback: BlobCallback, ..._encoding: [string?, number?]) => {
      void _encoding;
      callback(new Blob([new Uint8Array(encodedSizes.shift() ?? 0)], { type: 'image/jpeg' }));
    });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low',
        fillStyle: '',
        fillRect: vi.fn(),
        drawImage,
      })),
      toBlob,
    } as unknown as HTMLCanvasElement;

    class MockImage {
      naturalWidth = 2000;
      naturalHeight = 1000;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;

      readAsDataURL(blob: Blob) {
        this.result = `data:image/jpeg;base64,${'A'.repeat(Math.ceil(blob.size / 3) * 4)}`;
        queueMicrotask(() => this.onload?.());
      }
    }

    vi.stubGlobal('window', { createImageBitmap: true });
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bitmap decoder rejected image')));
    vi.stubGlobal('Image', MockImage);
    vi.stubGlobal('FileReader', MockFileReader);
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const file = { name: 'photo.png', type: 'image/png', size: 2 * 1024 * 1024 } as File;
    const result = await compressChatImage(file);

    expect(result).toMatchObject({ filename: 'photo.png', bytes: 127 * 1024 });
    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-image');
    expect(toBlob.mock.calls.map(call => call[2])).toEqual([0.84, 0.76, 0.68, 0.6, 0.84]);
    expect(drawImage).toHaveBeenNthCalledWith(1, expect.any(MockImage), 0, 0, 1280, 640);
    expect(drawImage).toHaveBeenNthCalledWith(2, expect.any(MockImage), 0, 0, 1050, 525);
    expect(result.bytes).toBeLessThanOrEqual(CHAT_IMAGE_MAX_ENCODED_BYTES);
  });
});