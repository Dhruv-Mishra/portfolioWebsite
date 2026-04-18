'use client';

/**
 * SuperuserCard — the shared foil-hero card body used by both:
 *   1. The persistent `/stickers` banner (SuperuserBanner)
 *   2. The sitewide reveal toast (SuperuserToast)
 *
 * Extraction rationale: both surfaces share identical visual DNA (gold foil
 * gradient, crown glyph, "SUPERUSER UNLOCKED" label, flavor, timestamp,
 * shimmer streak, optional confetti/glow). The banner renders it in a
 * max-w-xl block above the grid; the toast renders it inside a portal,
 * centered, with a backdrop. Only the outer wrapper differs.
 *
 * This component owns the CARD — the box with foil gradient, crown, labels,
 * the medal sticker, the confetti burst layer, and the glow pulse. It does
 * NOT own:
 *   - The entrance animation (parent controls that — reveal toast uses
 *     spring scale, banner uses a different spring; reduced-motion skips both)
 *   - The backdrop / dismissal (toast-only concern)
 *   - Sound playback (toast fires two sounds on mount; banner used to but no
 *     longer does — the toast takes over the reveal event)
 *   - Written reveal timestamp (caller decides when that fires)
 *
 * Re-render hygiene:
 *   - The card itself is stateless given `{ earnedAt, showConfetti, showGlow }`.
 *     Parent decides when to toggle the reveal flags.
 */

import { memo } from 'react';
import { m } from 'framer-motion';
import { Crown } from 'lucide-react';
import { SUPERUSER_STICKER, StickerSvg, type StickerId } from '@/lib/stickers';
import { STICKER_TOKENS } from '@/lib/designTokens';

interface SuperuserCardProps {
  /** Timestamp the superuser sticker was earned. Used for the formatted
   *  date and as the deterministic PRNG seed for the confetti burst. */
  earnedAt: number | undefined;
  /** When true, render the confetti layer. Parent toggles this on fresh
   *  reveal and clears after ~2.5s. */
  showConfetti: boolean;
  /** When true, render the glow-pulse ring. Same lifecycle as showConfetti
   *  but can be independently gated for reduce-motion scenarios. */
  showGlow: boolean;
}

/** Number of confetti particles for the reveal burst. Tuned for snappy
 *  effect on mid-range laptops; each particle is a short-lived CSS /
 *  framer-animated div. */
const CONFETTI_COUNT = 24;

/** Confetti palette — a warm "celebration" set that complements the gold. */
const CONFETTI_COLORS: ReadonlyArray<string> = [
  '#fbbf24', // amber
  '#f59e0b', // darker amber
  '#fde68a', // light yellow
  '#fb7185', // rose
  '#ec4899', // pink
  '#22c55e', // emerald
  '#3b82f6', // sky
  '#a855f7', // violet
];

interface ConfettiPiece {
  id: number;
  color: string;
  angle: number;
  dx: number;
  dy: number;
  delay: number;
  rotate: number;
}

function buildConfetti(seed: number): ConfettiPiece[] {
  // Deterministic PRNG so the piece positions are stable inside a single
  // reveal (avoids re-hydration jitter during the animation).
  let s = seed || 1;
  const rand = (): number => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const pieces: ConfettiPiece[] = [];
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const angle = (Math.PI * 2 * i) / CONFETTI_COUNT + rand() * 0.3;
    const distance = 120 + rand() * 180;
    pieces.push({
      id: i,
      color: CONFETTI_COLORS[Math.floor(rand() * CONFETTI_COLORS.length)],
      angle,
      dx: Math.cos(angle) * distance,
      dy: -Math.abs(Math.sin(angle)) * distance - 80 * rand(),
      delay: rand() * 180,
      rotate: (rand() - 0.5) * 720,
    });
  }
  return pieces;
}

const ConfettiDot = memo(function ConfettiDot({ piece }: { piece: ConfettiPiece }) {
  return (
    <m.div
      initial={{ opacity: 0, scale: 0, x: 0, y: 0, rotate: 0 }}
      animate={{
        opacity: [0, 1, 1, 0],
        scale: [0.4, 1.1, 1, 0.8],
        x: [0, piece.dx * 0.45, piece.dx * 0.85, piece.dx],
        y: [0, piece.dy * 0.4 - 30, piece.dy * 0.8, piece.dy + 140],
        rotate: [0, piece.rotate * 0.6, piece.rotate],
      }}
      transition={{
        duration: 1.25,
        delay: piece.delay / 1000,
        ease: 'easeOut',
        times: [0, 0.25, 0.65, 1],
      }}
      className="absolute top-1/2 left-1/2 w-2.5 h-2.5 rounded-[1px] pointer-events-none"
      style={{
        backgroundColor: piece.color,
        boxShadow: `0 0 4px ${piece.color}aa`,
      }}
      aria-hidden="true"
    />
  );
});

/**
 * Format the earned-at timestamp into a short human-readable date.
 * Uses the user's locale.
 */
function formatEarnedAt(ts: number): string {
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

function SuperuserCardImpl({
  earnedAt,
  showConfetti,
  showGlow,
}: SuperuserCardProps): React.ReactElement {
  const earnedLabel = earnedAt ? formatEarnedAt(earnedAt) : '';

  return (
    <div className="superuser-banner__card relative overflow-hidden rounded-lg border-2 shadow-xl px-5 md:px-8 py-5 md:py-7">
      {/* Confetti layer — positioned absolutely so it overflows the card */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none z-20" aria-hidden="true">
          {buildConfetti(earnedAt ?? 1).map((p) => (
            <ConfettiDot key={p.id} piece={p} />
          ))}
        </div>
      )}

      {/* Flex: sticker left, text right (stacks on narrow) */}
      <div className="relative z-10 flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
        {/* Foil medal sticker */}
        <div className="superuser-banner__medal shrink-0">
          <StickerSvg
            id={SUPERUSER_STICKER.id as StickerId}
            size={STICKER_TOKENS.size.hover}
          />
        </div>

        {/* Text block */}
        <div className="flex-1 text-center sm:text-left">
          {/* Tag */}
          <p className="superuser-banner__tag flex items-center justify-center sm:justify-start gap-1.5 text-[10px] md:text-xs font-bold uppercase tracking-[0.18em]">
            <Crown size={12} className="inline-block" aria-hidden="true" />
            <span>Achievement</span>
          </p>

          {/* Label */}
          <h2 className="superuser-banner__label mt-1 text-2xl md:text-4xl font-hand font-bold leading-tight">
            SUPERUSER UNLOCKED
          </h2>

          {/* Flavor */}
          <p className="superuser-banner__flavor mt-1.5 font-hand text-sm md:text-base italic">
            <span className="hidden sm:inline">You collected every sticker. Sudo access granted. Welcome, root.</span>
            <span className="sm:hidden">Every sticker collected. Sudo access granted.</span>
          </p>

          {/* Timestamp */}
          {earnedLabel ? (
            <p className="superuser-banner__timestamp mt-2 font-code text-[10px] md:text-xs tracking-wide opacity-70">
              earned on {earnedLabel}
            </p>
          ) : null}
        </div>
      </div>

      {/* Glow pulse ring (fresh reveal only) */}
      {showGlow && (
        <div
          aria-hidden="true"
          className="superuser-banner__glow pointer-events-none absolute inset-0"
        />
      )}
    </div>
  );
}

export default memo(SuperuserCardImpl);
