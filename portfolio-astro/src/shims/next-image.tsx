import type { ImgHTMLAttributes } from 'react';

interface StaticImageData {
  src: string;
  width?: number;
  height?: number;
  blurDataURL?: string;
}

interface ImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height'> {
  src: string | StaticImageData;
  alt: string;
  width?: number | `${number}`;
  height?: number | `${number}`;
  fill?: boolean;
  priority?: boolean;
  quality?: number | `${number}`;
  placeholder?: 'blur' | 'empty' | `data:image/${string}`;
  blurDataURL?: string;
}

export default function Image({ src, alt, fill, priority, quality: _quality, placeholder: _placeholder, blurDataURL: _blurDataURL, style, sizes: _sizes, ...props }: ImageProps) {
  const resolvedSrc = typeof src === 'string' ? src : src.src;
  const imageStyle = fill
    ? { ...style, position: 'absolute' as const, inset: 0, width: '100%', height: '100%' }
    : style;

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      style={imageStyle}
      loading={priority ? 'eager' : props.loading}
      decoding={props.decoding ?? 'async'}
      {...props}
    />
  );
}