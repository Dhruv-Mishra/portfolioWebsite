"use client";

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClearButtonProps {
  onClick: () => void;
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Sketchbook-styled "×" clear button for input drafts.
 * Render conditionally — only visible when the input has content.
 */
export function ClearButton({ onClick, size = 14, className, title = 'Clear input' }: ClearButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Clear input"
      title={title}
      className={cn(
        'inline-flex items-center justify-center shrink-0',
        'min-w-[36px] min-h-[36px] p-1.5 rounded-full',
        'text-[var(--c-ink)]/40 hover:text-red-600 dark:hover:text-red-400',
        'hover:bg-red-100/40 dark:hover:bg-red-950/30',
        'transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-ink)]/60',
        className,
      )}
    >
      <X size={size} strokeWidth={2.5} />
    </button>
  );
}
