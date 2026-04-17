"use client";

import { memo, useMemo } from 'react';
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

/**
 * GuestbookNote — renders a single pinned note on the wall.
 *
 * Structural note on tape clipping:
 *   The note body needs `overflow-hidden` to enforce the 260px max-height on
 *   long messages. The tape strip is positioned with a negative top offset to
 *   extend above the card edge — if it lives inside the overflow-hidden body,
 *   that negative offset gets clipped. Fix: wrap the note in an `overflow-visible`
 *   wrapper and keep the tape as a sibling of (not a child of) the clipped body,
 *   so it escapes the clip while the message text remains truncated.
 */
export const GuestbookNote = memo(function GuestbookNote({ entry, index }: GuestbookNoteProps) {
  const hash = useMemo(() => hashId(entry.id), [entry.id]);

  // Rotation: -5deg .. +5deg driven by hash.
  const rotation = useMemo(() => {
    const normalized = (hash % 1000) / 1000;
    return WALL_NOTE_ROTATION.minDeg + normalized * WALL_NOTE_ROTATION.rangeDeg;
  }, [hash]);

  // Left/right fold corner alternates by hash parity.
  const foldLeft = hash % 2 === 0;

  // Tape corner variant on every 4th note (desktop-only).
  const useCornerTape = hash % 4 === 0;

  // Entrance stagger capped at 480ms so scrolled-far notes don't animate with huge delays.
  const animationDelay = `${Math.min(index * GUESTBOOK_LIMITS.entranceStaggerMs, GUESTBOOK_LIMITS.entranceStaggerCapMs)}ms`;

  // Format date once — pure helper so SSR-stable for entries older than 30 days.
  const formattedDate = useMemo(() => formatRelativeOrShort(entry.createdAt), [entry.createdAt]);

  const signatureId = `note-${entry.id}-sig`;

  const wrapperStyle = useMemo<React.CSSProperties>(() => ({
    transform: `rotate(${rotation}deg)`,
    // Custom props read by the @keyframes wall-note-in rule.
    ['--note-rotate-start' as string]: `${rotation + 2}deg`,
    ['--note-rotate-end' as string]: `${rotation}deg`,
    animationDelay,
  }), [rotation, animationDelay]);

  const bodyStyle = useMemo<React.CSSProperties>(() => ({
    backgroundColor: 'var(--note-paper)',
  }), []);

  return (
    // OUTER wrapper: owns rotation + entrance animation; overflow is VISIBLE so
    // the tape strip (which lives below as a sibling of the clipped body) isn't
    // clipped. Note: `content-visibility: auto` from `content-defer` is applied
    // here too so off-screen notes still defer paint.
    <article
      aria-labelledby={signatureId}
      style={wrapperStyle}
      className={cn(
        'relative content-defer animate-wall-note-in',
        'shadow-md font-hand text-base text-[var(--c-ink)] border',
        GUESTBOOK_NOTE_BORDER,
      )}
    >
      {/* Tape — sibling of the clipped body, escapes the clip completely. */}
      <TapeStrip size="sm" className={useCornerTape ? CORNER_TAPE_CLASS : undefined} />

      {/* INNER body: this is the element that clips long messages to 260px.
          It keeps the background color, min/max height, and padding that were
          previously on <article>. overflow: hidden only applies here. */}
      <div
        style={bodyStyle}
        className={cn(
          'relative overflow-hidden',
          'min-h-[140px] max-h-[260px]',
          'p-5 pb-7 md:p-6 md:pb-9',
        )}
      >
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
      </div>
    </article>
  );
});
