import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { TapeStrip } from '@/components/ui/TapeStrip';
import {
  WALL_NOTE_ROTATION,
  GUESTBOOK_NOTE_BORDER,
  GUESTBOOK_LIMITS,
  GRADIENT_TOKENS,
} from '@/lib/designTokens';
import { formatRelativeOrShort, type GuestbookEntry } from '@/lib/guestbook';

interface GuestbookNoteProps {
  entry: GuestbookEntry;
  /** Visual-order index — used to stagger the entrance animation and tape corner variant. */
  index: number;
}

/** 32-bit unsigned hash of a numeric id → deterministic rotation bucket. */
function hashId(id: number): number {
  // Integer hash (splitmix32-ish) — sufficient for small buckets.
  let h = (id ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

/** Hoisted style fragments — avoid per-render allocation. */
const FOLD_CORNER_LEFT_STYLE = { background: GRADIENT_TOKENS.foldCornerAlt } as const;
const FOLD_CORNER_RIGHT_STYLE = { background: GRADIENT_TOKENS.foldCorner } as const;

/** Corner-variant tape override: used on desktop for every 4th note for visual variety. */
const CORNER_TAPE_CLASS = '!left-auto !right-4 !top-[-8px] rotate-[18deg] hidden md:block';

export function GuestbookNote({ entry, index }: GuestbookNoteProps) {
  const hash = hashId(entry.id);

  // Rotation: -5deg .. +5deg driven by hash.
  const rotation = WALL_NOTE_ROTATION.minDeg + ((hash % 1000) / 1000) * WALL_NOTE_ROTATION.rangeDeg;

  // Left/right fold corner alternates by hash parity.
  const foldLeft = hash % 2 === 0;

  // Tape corner variant on every 4th note (desktop-only).
  const useCornerTape = hash % 4 === 0;

  // Entrance stagger capped at 480ms so scrolled-far notes don't animate with huge delays.
  const animationDelay = `${Math.min(index * GUESTBOOK_LIMITS.entranceStaggerMs, GUESTBOOK_LIMITS.entranceStaggerCapMs)}ms`;

  const formattedDate = formatRelativeOrShort(entry.createdAt);

  const signatureId = `note-${entry.id}-sig`;

  const wrapperStyle: CSSProperties = {
    transform: `rotate(${rotation}deg)`,
    // Custom props read by the @keyframes wall-note-in rule.
    ['--note-rotate-start' as string]: `${rotation + 2}deg`,
    ['--note-rotate-end' as string]: `${rotation}deg`,
    animationDelay,
  };

  return (
    // No `content-visibility: auto`: mobile browsers can inflate deferred elements inside CSS columns and widen the page.
    <article
      aria-labelledby={signatureId}
      style={wrapperStyle}
      className={cn(
        'relative w-full max-w-full animate-wall-note-in',
        'shadow-md font-hand text-base md:text-lg text-[var(--c-ink)] border',
        GUESTBOOK_NOTE_BORDER,
      )}
    >
      {/* Tape extends above the paper. */}
      <TapeStrip size="sm" className={useCornerTape ? CORNER_TAPE_CLASS : undefined} />

      <div
        className={cn(
          'note-material relative',
          'min-h-[8.75em]',
          'p-5 pb-7 md:p-6 md:pb-9',
        )}
      >
        {/* Message body */}
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed pr-2">
          {entry.message}
        </p>

        {/* Folded corner — alternates side by hash parity */}
        <div
          aria-hidden="true"
          className={cn(
            'absolute pointer-events-none w-[18px] h-[18px] bottom-0',
            foldLeft ? 'left-0' : 'right-0',
          )}
          style={foldLeft ? FOLD_CORNER_LEFT_STYLE : FOLD_CORNER_RIGHT_STYLE}
        />

        {/* Posted date (bottom-left) */}
        <time
          dateTime={entry.createdAt}
          className="absolute bottom-2 left-4 font-hand text-xs opacity-45"
          suppressHydrationWarning
        >
          <span className="sr-only">Posted </span>
          {formattedDate}
        </time>

        {/* Signature (bottom-right) */}
        <span
          id={signatureId}
          title={entry.name || 'Anonymous'}
          className="absolute bottom-2 right-4 max-w-[65%] truncate text-right font-hand italic text-sm opacity-60"
        >
          — {entry.name || 'Anonymous'}
        </span>
      </div>
    </article>
  );
}
