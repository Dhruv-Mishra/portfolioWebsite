import { memo, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { TAPE_STYLE } from '@/lib/constants';

interface TapeStripProps {
  /** Size variant: 'sm' for chat notes, 'md' for feedback/larger notes */
  size?: 'sm' | 'md';
  className?: string;
  /** When set, opts this strip into disco wiggle and merges onto TAPE_STYLE. */
  discoStyle?: CSSProperties;
}

/** Realistic torn-edge tape strip used to attach sticky notes */
export const TapeStrip = memo(function TapeStrip({ size = 'sm', className, discoStyle }: TapeStripProps) {
  return (
    <div
      data-tape-strip
      data-disco-motion={discoStyle ? 'wiggle' : undefined}
      className={cn(
        "pointer-events-none absolute left-1/2 -translate-x-1/2 shadow-sm z-20",
        size === 'sm'
          ? "-top-2 w-16 md:w-24 h-5 md:h-6"
          : "-top-3 w-24 md:w-32 h-7 md:h-9",
        className,
      )}
      style={discoStyle ? { ...TAPE_STYLE, ...discoStyle } : TAPE_STYLE}
    />
  );
});
