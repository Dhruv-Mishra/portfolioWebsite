"use client";

import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { TapeStrip } from '@/components/ui/TapeStrip';
import {
  WALL_NOTE_ROTATION,
  GUESTBOOK_NOTE_COLORS,
  GUESTBOOK_NOTE_BORDERS,
  GUESTBOOK_LIMITS,
  GRADIENT_TOKENS,
} from '@/lib/designTokens';
import { formatRelativeOrShort, type GuestbookEntry } from '@/lib/guestbook';

interface GuestbookNoteProps {
  entry: GuestbookEntry;
  /** Visual-order index — used to stagger the entrance animation and tape corner variant. */
  index: number;
}

/** 32-bit unsigned hash of a numeric id → deterministic rotation/color bucket. */
function hashId(id: number): number {
  // Integer hash (splitmix32-ish) — sufficient for 3 small buckets.
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

export const GuestbookNote = memo(function GuestbookNote({ entry, index }: GuestbookNoteProps) {
  const hash = useMemo(() => hashId(entry.id), [entry.id]);

  // Rotation: -5deg .. +5deg driven by hash.
  const rotation = useMemo(() => {
    const normalized = (hash % 1000) / 1000;
    return WALL_NOTE_ROTATION.minDeg + normalized * WALL_NOTE_ROTATION.rangeDeg;
  }, [hash]);

  // Hash-indexed color + dark-mode border.
  const colorToken = GUESTBOOK_NOTE_COLORS[hash % GUESTBOOK_NOTE_COLORS.length];
  const borderClass = GUESTBOOK_NOTE_BORDERS[hash % GUESTBOOK_NOTE_BORDERS.length];

  // Left/right fold corner alternates by hash parity.
  const foldLeft = hash % 2 === 0;

  // Tape corner variant on every 4th note (desktop-only).
  const useCornerTape = hash % 4 === 0;

  // Entrance stagger capped at 480ms so scrolled-far notes don't animate with huge delays.
  const animationDelay = `${Math.min(index * GUESTBOOK_LIMITS.entranceStaggerMs, GUESTBOOK_LIMITS.entranceStaggerCapMs)}ms`;

  // Format date once — pure helper so SSR-stable for entries older than 30 days.
  const formattedDate = useMemo(() => formatRelativeOrShort(entry.createdAt), [entry.createdAt]);

  const signatureId = `note-${entry.id}-sig`;

  const noteStyle = useMemo<React.CSSProperties>(() => ({
    backgroundColor: `var(${colorToken})`,
    transform: `rotate(${rotation}deg)`,
    // Custom props read by the @keyframes wall-note-in rule.
    ['--note-rotate-start' as string]: `${rotation + 2}deg`,
    ['--note-rotate-end' as string]: `${rotation}deg`,
    animationDelay,
  }), [colorToken, rotation, animationDelay]);

  return (
    <article
      aria-labelledby={signatureId}
      style={noteStyle}
      className={cn(
        'relative content-defer animate-wall-note-in',
        'min-h-[140px] max-h-[260px] overflow-hidden',
        'p-5 pb-7 md:p-6 md:pb-9',
        'shadow-md font-hand text-base text-[var(--c-ink)] border',
        borderClass,
      )}
    >
      <TapeStrip size="sm" className={useCornerTape ? CORNER_TAPE_CLASS : undefined} />

      {/* Message body */}
      <p className="whitespace-pre-wrap break-words leading-relaxed pr-2">
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
        className="absolute bottom-2 left-4 font-hand text-[10px] opacity-35"
        suppressHydrationWarning
      >
        <span className="sr-only">Posted </span>
        {formattedDate}
      </time>

      {/* Signature (bottom-right) */}
      <span
        id={signatureId}
        className="absolute bottom-2 right-4 font-hand italic text-xs opacity-50"
      >
        — {entry.name || 'Anonymous'}
      </span>
    </article>
  );
});
