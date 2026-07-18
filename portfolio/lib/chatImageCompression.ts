export const CHAT_IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const CHAT_IMAGE_MAX_RAW_BYTES = 10 * 1024 * 1024;
export const CHAT_IMAGE_MAX_ENCODED_BYTES = 128 * 1024;
export const CHAT_IMAGE_MAX_DIMENSION = 1280;

const CHAT_IMAGE_JPEG_QUALITIES = [0.84, 0.76, 0.68, 0.6] as const;
const CHAT_IMAGE_DOWNSCALE_FACTOR = 0.82;

export interface ChatImageAttachment {
  dataUrl: string;
  filename: string;
  bytes: number;
}

type ImageSize = { width: number; height: number };

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Image preparation was cancelled.', 'AbortError');
  }
}

export function isSupportedChatImageType(type: string): boolean {
  return (CHAT_IMAGE_ALLOWED_TYPES as readonly string[]).includes(type);
}

export function getDataUrlDecodedByteLength(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function fitChatImageDimensions({ width, height }: ImageSize, maxDimension = CHAT_IMAGE_MAX_DIMENSION): ImageSize {
  if (width <= maxDimension && height <= maxDimension) return { width, height };
  const scale = maxDimension / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function assertValidImageFile(file: File): void {
  if (!isSupportedChatImageType(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP image.');
  }
  if (file.size > CHAT_IMAGE_MAX_RAW_BYTES) {
    throw new Error('Choose an image smaller than 10 MB.');
  }
}

async function loadImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Some browsers expose createImageBitmap but reject image formats their
      // regular image decoder supports, so continue through the fallback.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  let image: HTMLImageElement;
  try {
    image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('This image could not be read.'));
      element.src = objectUrl;
    });
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release: () => URL.revokeObjectURL(objectUrl),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number, signal?: AbortSignal): Promise<Blob> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      try {
        throwIfAborted(signal);
        if (!blob) {
          reject(new Error('Image compression is unavailable in this browser.'));
          return;
        }
        resolve(blob);
      } catch (error) {
        reject(error);
      }
    }, 'image/jpeg', quality);
  });
}

function blobToDataUrl(blob: Blob, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        throwIfAborted(signal);
        resolve(String(reader.result));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('The compressed image could not be read.'));
    reader.onabort = () => reject(new DOMException('Image preparation was cancelled.', 'AbortError'));
    reader.readAsDataURL(blob);
  });
}

export async function compressChatImage(file: File, signal?: AbortSignal): Promise<ChatImageAttachment> {
  assertValidImageFile(file);
  throwIfAborted(signal);
  const loaded = await loadImage(file);

  try {
    let dimensions = fitChatImageDimensions(loaded);
    for (let pass = 0; pass < 6; pass += 1) {
      throwIfAborted(signal);
      const canvas = document.createElement('canvas');
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image compression is unavailable in this browser.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(loaded.source, 0, 0, canvas.width, canvas.height);

      for (const quality of CHAT_IMAGE_JPEG_QUALITIES) {
        const blob = await canvasToBlob(canvas, quality, signal);
        const bytes = blob.size;
        if (bytes <= CHAT_IMAGE_MAX_ENCODED_BYTES) {
          const dataUrl = await blobToDataUrl(blob, signal);
          return { dataUrl, filename: file.name, bytes };
        }
      }
      dimensions = {
        width: Math.max(1, Math.round(dimensions.width * CHAT_IMAGE_DOWNSCALE_FACTOR)),
        height: Math.max(1, Math.round(dimensions.height * CHAT_IMAGE_DOWNSCALE_FACTOR)),
      };
    }
  } finally {
    loaded.release();
  }

  throw new Error('That image could not be compressed small enough. Try a simpler image.');
}