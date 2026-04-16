import { memo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { OVERLAY_TOKENS } from '@/lib/designTokens';

interface KbdProps {
  children: ReactNode;
  className?: string;
}

/**
 * `<Kbd>` — a paper-on-paper key cap with an asymmetric rough-sketch radius
 * and a 1px ink drop-shadow that makes the cap look slightly lifted off the
 * page. Used inside the Shortcuts Overlay and Command Palette hints.
 */
const KBD_STYLE = {
  borderRadius: OVERLAY_TOKENS.kbdRadius,
  boxShadow: OVERLAY_TOKENS.kbdShadow,
} as const;

export const Kbd = memo(function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      style={KBD_STYLE}
      className={cn(
        'inline-flex items-center justify-center',
        'min-w-[22px] h-6 px-1.5',
        'font-code text-[11px] font-semibold text-[var(--c-ink)]',
        'bg-[var(--c-paper)] border-2 border-[var(--c-ink)]/40',
        'translate-y-[-0.5px]',
        'select-none',
        className,
      )}
    >
      {children}
    </kbd>
  );
});
