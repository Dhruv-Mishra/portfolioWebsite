'use client';

/**
 * EscapeBanner — the "Escape the Matrix" achievement card shown on the
 * `/stickers` page once the user has escaped via the in-overlay ESCAPE
 * THE MATRIX button.
 *
 * Design intent (per brief):
 *   - Visually STRONGER than the sudo/superuser gold-foil banner — this is
 *     a later, rarer achievement, so it should feel earned. We cover the
 *     same visual real estate (equal or greater width, same vertical
 *     footprint) and give it the distinct emerald-on-black "signal
 *     acquired" treatment.
 *   - Shares the structural DNA with `SuperuserCard` (badge area + text
 *     block + optional confetti) so the two banners sit on the /stickers
 *     page in a consistent rhythm, but every surface is different — no
 *     gold foil, no crown glyph, no amber palette.
 *   - Renders a stable call-to-action: "open matrix notes" anchored into
 *     the card itself so unlocked users always have an entry point from
 *     the album.
 */

import { memo } from 'react';
import Link from 'next/link';
import { m } from 'framer-motion';
import { Terminal } from 'lucide-react';

interface EscapeBannerProps {
  /** Timestamp the user first escaped (from the sticker store). Drives
   *  the formatted date. 0 / undefined → no date line. */
  escapedAt: number | undefined;
  /** When true, render the transient glow ring. Parent toggles on mount
   *  for fresh reveals; can stay false on album revisits. */
  showGlow?: boolean;
}

function formatEscapedAt(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function EscapeBannerImpl({
  escapedAt,
  showGlow = false,
}: EscapeBannerProps): React.ReactElement {
  const dateLabel = escapedAt ? formatEscapedAt(escapedAt) : '';

  return (
    <m.div
      role="status"
      aria-live="polite"
      aria-label="Escape the Matrix achievement unlocked"
      className="escape-banner relative mx-auto mb-6 md:mb-10 max-w-2xl w-full"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="escape-banner__card relative overflow-hidden rounded-lg border-2 px-5 md:px-8 py-5 md:py-7">
        {/* Flex: icon/medal left, text right (stacks on narrow) */}
        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
          {/* Medal — a minimalist "green pill" roundel with a matrix-glyph
              pattern. SVG-only so it scales crisply and theme-adapts. */}
          <div className="escape-banner__medal shrink-0">
            <EscapeMedal size={88} />
          </div>

          {/* Text block */}
          <div className="flex-1 text-center sm:text-left">
            <p className="escape-banner__tag flex items-center justify-center sm:justify-start gap-1.5 font-code text-[10px] md:text-xs font-bold uppercase">
              <Terminal size={12} aria-hidden="true" />
              <span>Signal · Acquired</span>
            </p>

            <h2 className="escape-banner__label mt-1 font-hand text-2xl md:text-4xl font-bold leading-tight">
              ESCAPED THE MATRIX
            </h2>

            <p className="escape-banner__flavor mt-1.5 font-hand text-sm md:text-base italic">
              <span className="hidden sm:inline">
                You found the second door and walked through it. Notes from the other side are yours.
              </span>
              <span className="sm:hidden">
                You walked through the second door. The notes are yours.
              </span>
            </p>

            {/* CTA — always-visible Link into the notes wall */}
            <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <Link
                href="/matrix-notes"
                className="inline-flex items-center gap-2 min-h-[40px] px-4 font-code text-[11px] tracking-[0.2em] uppercase text-emerald-100 bg-emerald-500/20 border border-emerald-300/70 rounded-md hover:bg-emerald-400/30 hover:border-emerald-200 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                prefetch={false}
              >
                open matrix notes →
              </Link>
              {dateLabel ? (
                <span className="escape-banner__timestamp font-code text-[10px] md:text-xs tracking-wide">
                  escaped on {dateLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {showGlow ? (
          <div
            aria-hidden="true"
            className="escape-banner__glow pointer-events-none absolute inset-0"
          />
        ) : null}
      </div>
    </m.div>
  );
}

/**
 * Minimalist emerald medal — a black roundel with glyph-rain strokes, framed
 * by a pulsing ring. Distinct from the gold-foil superuser sticker SVG, so
 * the two banners can sit adjacent without visual echo.
 */
const EscapeMedal = memo(function EscapeMedal({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 88 88"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="esc-medal-bg" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#052e23" />
          <stop offset="70%" stopColor="#020d08" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
        <linearGradient id="esc-medal-ring" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="50%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
      {/* Outer pulse ring */}
      <circle cx="44" cy="44" r="41" fill="none" stroke="url(#esc-medal-ring)" strokeWidth="2" />
      {/* Inner roundel */}
      <circle cx="44" cy="44" r="34" fill="url(#esc-medal-bg)" stroke="#10b981" strokeWidth="1.2" />
      {/* Glyph rain streaks */}
      <g fontFamily="'Fira Code', monospace" fontSize="8" fill="#6ee7b7" opacity="0.85">
        <text x="22" y="28">0</text>
        <text x="30" y="34">1</text>
        <text x="38" y="26">ｱ</text>
        <text x="46" y="32">ｷ</text>
        <text x="54" y="27">0</text>
        <text x="60" y="36">ｿ</text>
        <text x="26" y="44">ﾒ</text>
        <text x="35" y="48">1</text>
        <text x="44" y="44">0</text>
        <text x="52" y="48">ｺ</text>
        <text x="60" y="46">1</text>
        <text x="28" y="58">ﾊ</text>
        <text x="38" y="60">1</text>
        <text x="48" y="58">ｳ</text>
        <text x="56" y="60">0</text>
      </g>
      {/* Center keycap — a small "ESC" label */}
      <rect x="32" y="52" width="24" height="14" rx="3" fill="#020d08" stroke="#10b981" strokeWidth="1.3" />
      <text
        x="44"
        y="62"
        textAnchor="middle"
        fontFamily="'Fira Code', monospace"
        fontSize="7"
        fontWeight="bold"
        fill="#6ee7b7"
        letterSpacing="1.5"
      >
        ESC
      </text>
    </svg>
  );
});

export default memo(EscapeBannerImpl);
