import { memo } from 'react';
import { cn } from '@/lib/utils';
import { TAPE_STYLE } from '@/lib/constants';

interface TapeStripProps {
  /** Size variant: 'sm' for chat notes, 'md' for feedback/larger notes */
  size?: 'sm' | 'md';
  className?: string;
}

/** Realistic torn-edge tape strip used to attach sticky notes */
export const TapeStrip = memo(function TapeStrip({ size = 'sm', className }: TapeStripProps) {
  return (
    <div
      className={cn(
        "absolute left-1/2 -translate-x-1/2 shadow-sm z-20",
        size === 'sm'
          ? "-top-2 w-16 md:w-24 h-5 md:h-6"
          : "-top-3 w-24 md:w-32 h-7 md:h-9",
        className,
      )}
      style={TAPE_STYLE}
    />
  );
});
