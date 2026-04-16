"use client";

/**
 * Sticker Drawer — the achievement album page.
 *
 * Structure:
 *   - Header: hand-lettered title + WavyUnderline + subtitle.
 *   - Progress card: tiny tilted taped index card showing `{unlocked}/{total} pinned`.
 *   - Empty / first-sticker caption above the grid.
 *   - Grid: 2/3/4/5 columns across breakpoints, each cell a <StickerCard>.
 *
 * On mount: markAlbumSeen() dismisses the badge pulse.
 */
import { memo, useEffect, useMemo } from 'react';
import { m } from 'framer-motion';
import { STICKER_ROSTER, StickerSvg, rotationForId, hashStickerId, type StickerId, type StickerEntry } from '@/lib/stickers';
import { useStickers } from '@/hooks/useStickers';
import { TapeStrip } from '@/components/ui/TapeStrip';
import { WavyUnderline } from '@/components/ui/WavyUnderline';
import { cn } from '@/lib/utils';
import { STICKER_TOKENS } from '@/lib/designTokens';

export default function StickerDrawerPage() {
  const { unlocked, total, unlockedAt, isUnlocked, markAlbumSeen } = useStickers();

  // Mark album seen on mount so the glance badge stops pulsing.
  useEffect(() => {
    markAlbumSeen();
  }, [markAlbumSeen]);

  // Sort: unlocked first (by when earned), locked after (roster order).
  const ordered = useMemo(() => {
    const unlockedSet = new Set(unlocked);
    const unlockedEntries = STICKER_ROSTER.filter((s) => unlockedSet.has(s.id)).sort(
      (a, b) => (unlockedAt[a.id] ?? 0) - (unlockedAt[b.id] ?? 0),
    );
    const lockedEntries = STICKER_ROSTER.filter((s) => !unlockedSet.has(s.id));
    return [...unlockedEntries, ...lockedEntries];
  }, [unlocked, unlockedAt]);

  const unlockedCount = unlocked.length;

  // Caption copy — shifts based on progress.
  let caption: string;
  if (unlockedCount === 0) {
    caption = 'no stickers yet — go explore!';
  } else if (unlockedCount === 1) {
    caption = 'nice, your first one! keep going.';
  } else if (unlockedCount === total) {
    caption = 'you collected them all ~';
  } else {
    caption = `${total - unlockedCount} still waiting to be found ~`;
  }

  return (
    <main className="min-h-[100dvh] pt-12 md:pt-16 pb-16 px-4 md:px-8 relative z-10">
      <div className="max-w-6xl mx-auto">
        {/* ─── Header ─── */}
        <header className="text-center mb-6 md:mb-8">
          <h1 className="text-4xl md:text-6xl font-hand font-bold text-[var(--c-heading)] inline-block">
            The Sticker Drawer
          </h1>
          <WavyUnderline className="max-w-[360px] mx-auto" />
          <p className="mt-2 font-hand text-lg md:text-xl text-[var(--c-ink)] opacity-60">
            Collect them by poking around ~
          </p>
        </header>

        {/* ─── Progress pill ─── */}
        <ProgressCard unlockedCount={unlockedCount} total={total} />

        {/* ─── Progress caption ─── */}
        <p className="mt-6 md:mt-8 text-center font-hand italic text-lg md:text-xl text-[var(--c-ink)] opacity-50">
          {caption}
        </p>

        {/* ─── Grid ─── */}
        <section
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 md:gap-8 mt-6 md:mt-8"
          aria-label="Sticker collection"
        >
          {ordered.map((sticker, index) => (
            <StickerCard
              key={sticker.id}
              sticker={sticker}
              unlocked={isUnlocked(sticker.id)}
              index={index}
            />
          ))}
        </section>
      </div>
    </main>
  );
}

// ─── Progress card ──────────────────────────────────────────────────────
interface ProgressCardProps {
  unlockedCount: number;
  total: number;
}

const ProgressCard = memo(function ProgressCard({ unlockedCount, total }: ProgressCardProps) {
  const pct = total === 0 ? 0 : Math.round((unlockedCount / total) * 100);
  return (
    <div className="flex justify-center">
      <div
        className="relative bg-[var(--note-user)] border border-yellow-300/40 dark:border-yellow-400/20 rounded-sm shadow-md px-6 py-3 pt-4 font-hand rotate-[-1deg]"
      >
        <TapeStrip size="sm" />
        <p className="text-center text-lg md:text-xl font-bold text-[var(--c-heading)]">
          <span className="text-2xl md:text-3xl">{unlockedCount}</span>
          <span className="opacity-60 mx-0.5">/</span>
          <span className="text-2xl md:text-3xl">{total}</span>
          <span className="ml-2 opacity-70 text-sm md:text-base">pinned</span>
        </p>
        <p className="text-center text-xs text-[var(--c-ink)]/50 mt-0.5">
          {pct}% of the drawer
        </p>
      </div>
    </div>
  );
});

// ─── Individual sticker card ────────────────────────────────────────────
interface StickerCardProps {
  sticker: StickerEntry;
  unlocked: boolean;
  index: number;
}

const STICKER_CARD_SPRING = { type: 'spring' as const, stiffness: 300, damping: 22 };

const StickerCard = memo(function StickerCard({ sticker, unlocked }: StickerCardProps) {
  const rotate = rotationForId(sticker.id);
  const hash = hashStickerId(sticker.id);
  // Hash-staggered idle float params — gives each sticker its own tempo.
  const floatDuration = 2.8 + (hash % 120) / 100; // 2.8s..4.0s
  const floatDelay = (hash % 100) / 100; // 0..1s

  return (
    <m.article
      className={cn(
        'group relative bg-[var(--c-paper)] border-2 border-dashed border-[var(--c-grid)]/30 rounded-sm shadow-md p-4 pt-6 flex flex-col items-center text-center font-hand',
      )}
      style={{ transform: `rotate(${rotate}deg)` }}
      initial={{ opacity: 0, y: 12 }}
      animate={unlocked ? { opacity: 1, y: [0, -1.5, 0] } : { opacity: 1, y: 0 }}
      transition={
        unlocked
          ? { y: { repeat: Infinity, duration: floatDuration, delay: floatDelay, ease: 'easeInOut' }, opacity: { duration: 0.3 } }
          : { duration: 0.3 }
      }
      whileHover={
        unlocked
          ? { scale: 1.04, rotate: 0, transition: STICKER_CARD_SPRING }
          : { rotate: [rotate, rotate + 6, rotate - 6, rotate], transition: { duration: 0.4 } }
      }
      aria-label={unlocked ? sticker.label : 'Locked sticker — keep exploring'}
    >
      <TapeStrip size="sm" />

      {/* Locked badge — subtle "??" at top-right */}
      {!unlocked && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-2 font-hand italic text-xs text-[var(--c-ink)] opacity-30 select-none"
        >
          ??
        </span>
      )}

      {/* Sticker SVG */}
      <div
        className={cn(
          'mt-2 mb-2 transition-[filter,opacity] duration-300',
          !unlocked && 'grayscale opacity-35',
        )}
      >
        <StickerSvg id={sticker.id as StickerId} size={STICKER_TOKENS.size.card} />
      </div>

      {/* Label */}
      <h2
        className={cn(
          'font-bold text-[var(--c-heading)] text-base md:text-lg leading-tight',
          !unlocked && 'opacity-50',
        )}
      >
        {unlocked ? (
          sticker.label
        ) : (
          <span aria-hidden="true">???</span>
        )}
      </h2>

      {/* Description / hint — 2-line clamp */}
      <p
        className={cn(
          'text-xs md:text-sm mt-1 text-[var(--c-ink)]/70 leading-snug line-clamp-2',
          !unlocked && 'italic text-[var(--c-ink)]/50',
        )}
      >
        {unlocked ? sticker.description : sticker.hint}
      </p>
    </m.article>
  );
});
