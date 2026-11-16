import type { ImageLoaderProps } from 'next/image';

/**
 * Serves pre-sized files instead of an image optimizer (none runs on the VMs). Project thumbnails taken from the
 * videos have a 384px copy next to the 640px one (scripts/build-project-thumbs.py); anything else is served as-is,
 * and images without a smaller copy pass `unoptimized` so they skip this.
 */
export default function imageLoader({ src, width }: ImageLoaderProps): string {
  return width <= 384 && /^\/resources\/video\/[^/]+\.webp$/.test(src) ? src.replace(/\.webp$/, '-384.webp') : src;
}
