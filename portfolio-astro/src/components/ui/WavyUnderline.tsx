import { memo } from 'react';
import { cn } from '@/lib/utils';

interface WavyUnderlineProps {
  className?: string;
}

/** Decorative wavy underline SVG */
export const WavyUnderline = memo(function WavyUnderline({ className }: WavyUnderlineProps) {
  return (
    <svg className={cn("w-full h-3 mt-1", className)} viewBox="0 0 300 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M0 6 Q25 0 50 6 Q75 12 100 6 Q125 0 150 6 Q175 12 200 6 Q225 0 250 6 Q275 12 300 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.3"
      />
    </svg>
  );
});
