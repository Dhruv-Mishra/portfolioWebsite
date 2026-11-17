import type { LucideIcon } from 'lucide-react';
import { TapeStrip } from '@/components/ui/TapeStrip';
import { GRADIENT_TOKENS } from '@/lib/designTokens';
import { cn } from '@/lib/utils';

export type NoteTone = 'blue' | 'yellow' | 'coral' | 'card';

const TONES: Record<NoteTone, { paper: string; icon: string; label: string }> = {
  blue: {
    paper: 'bg-[var(--c-note-blue)] border-indigo-300/40 dark:border-indigo-400/25',
    icon: 'text-indigo-600/80 dark:text-indigo-200/80',
    label: 'text-indigo-950 dark:text-indigo-50',
  },
  yellow: {
    paper: 'bg-paper-yellow border-yellow-300/50',
    icon: 'text-indigo-500/80',
    label: 'text-gray-800',
  },
  coral: {
    paper: 'bg-paper-coral border-orange-300/50 dark:bg-paper-coral-dark dark:border-orange-400/30',
    icon: 'text-rose-500/80 dark:text-rose-300/80',
    label: 'text-gray-800 dark:text-gray-100',
  },
  /** A white index card, like the resume on the About board. */
  card: {
    paper: 'bg-[var(--c-polaroid)] border-stone-300/60',
    icon: 'text-red-600/80',
    label: 'text-gray-800',
  },
};

const FOLD_STYLE = { background: GRADIENT_TOKENS.noteFold } as const;

/** The taped sticky-note face shared by note buttons and note links; the parent owns semantics and the `group`. */
export function NoteFace({ icon: Icon, label, tone, className }: { icon: LucideIcon; label: string; tone: NoteTone; className?: string }) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        'paper-texture relative flex min-h-11 items-center gap-2.5 border px-4 py-2.5 shadow-sm md:px-5 md:py-3 transition-transform duration-300 ease-paper md:shadow-md md:group-hover:rotate-0',
        t.paper,
        className,
      )}
    >
      <TapeStrip size="sm" />
      <Icon aria-hidden="true" className={cn('size-5 shrink-0', t.icon)} strokeWidth={1.8} />
      <span className={cn('font-hand text-base leading-tight md:text-lg', t.label)}>{label}</span>
      <span aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 size-4" style={FOLD_STYLE} />
    </span>
  );
}
