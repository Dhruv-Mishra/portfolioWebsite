"use client";

/**
 * Sticker Drawer — the achievement album page.
 *
 * Structure:
 *   - Header: hand-lettered title + WavyUnderline + subtitle.
 *   - SuperuserBanner (only when earned): premium gold-foil hero card at
 *     the top, taller/wider than a grid cell. The inline superuser tile
 *     is NOT appended to the grid anymore — the banner owns the celebration.
 *   - Progress card: tiny tilted taped index card showing `{unlocked}/{total} pinned`.
 *   - Empty / first-sticker caption above the grid.
 *   - Grid: 2/3/4/5 columns across breakpoints, each cell a <StickerCard>.
 *
 * On mount:
 *   - markAlbumSeen() dismisses the badge pulse.
 *   - stickerBus.emit('drawer-dweller') unlocks the "visited the album" sticker.
 *
 * Perf note: Cards use pure CSS animations (`sticker-card`, `sticker-card--unlocked`,
 * `sticker-card--locked`) defined in app/globals.css. The banner uses
 * framer-motion for its one-shot reveal animation and CSS keyframes for the
 * persistent shimmer (see `.superuser-banner__card::after`).
 */
import { memo, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { STICKER_ROSTER, StickerSvg, rotationForId, hashStickerId, SUPERUSER_STICKER, type StickerId, type StickerEntry } from '@/lib/stickers';
import { useStickers } from '@/hooks/useStickers';
import { stickerBus } from '@/lib/stickerBus';
import { TapeStrip } from '@/components/ui/TapeStrip';
import { WavyUnderline } from '@/components/ui/WavyUnderline';
import { cn } from '@/lib/utils';
import { STICKER_TOKENS } from '@/lib/designTokens';
import SuperuserBanner from '@/components/SuperuserBanner';

export default function StickerDrawerPage() {
  const { unlocked, total, unlockedAt, markAlbumSeen, hasSuperuser } = useStickers();
  const announcedSuperuserRef = useRef(false);

  // Mark album seen on mount so the glance badge stops pulsing.
  // Also unlock the "visited the album" sticker — cheap, idempotent.
  useEffect(() => {
    markAlbumSeen();
    stickerBus.emit('drawer-dweller');
  }, [markAlbumSeen]);

  // Build the unlocked-id lookup set once per change — O(1) membership per card.
  const unlockedSet = useMemo(() => new Set<StickerId>(unlocked), [unlocked]);

  // Sort: unlocked regular stickers first (by when earned), then locked
  // regulars (roster order). The Superuser sticker is promoted to
  // `SuperuserBanner` above the grid — no inline tile here to avoid
  // duplicating the celebration.
  const ordered = useMemo<ReadonlyArray<StickerEntry>>(() => {
    const unlockedEntries = STICKER_ROSTER.filter((s) => unlockedSet.has(s.id)).sort(
      (a, b) => (unlockedAt[a.id] ?? 0) - (unlockedAt[b.id] ?? 0),
    );
    const lockedEntries = STICKER_ROSTER.filter((s) => !unlockedSet.has(s.id));
    return [...unlockedEntries, ...lockedEntries];
  }, [unlockedSet, unlockedAt]);

  // Regular-only unlocked count (hidden superuser excluded from the ratio).
  const unlockedCount = unlocked.filter((id) => id !== SUPERUSER_STICKER.id).length;

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

  // Announce superuser to screen readers the first time it appears.
  useEffect(() => {
    if (hasSuperuser && !announcedSuperuserRef.current) {
      announcedSuperuserRef.current = true;
    }
  }, [hasSuperuser]);

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

        {/* ─── Superuser banner — shown only once every regular sticker is collected ─── */}
        {hasSuperuser ? (
          <div className="mt-6 md:mt-8">
            <SuperuserBanner earnedAt={unlockedAt[SUPERUSER_STICKER.id]} />
          </div>
        ) : null}

        {/* ─── Progress pill ─── */}
        <ProgressCard unlockedCount={unlockedCount} total={total} />

        {/* ─── Progress caption ─── */}
        <p className="mt-6 md:mt-8 text-center font-hand italic text-lg md:text-xl text-[var(--c-ink)] opacity-50">
          {caption}
        </p>

        {/* Superuser live-region announcement — once, polite. */}
        <div role="status" aria-live="polite" className="sr-only">
          {hasSuperuser ? 'You earned the Superuser sticker. Sudo terminal access unlocked.' : ''}
        </div>

        {/* ─── Grid ─── */}
        <section
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 md:gap-8 mt-6 md:mt-8"
          aria-label="Sticker collection"
        >
          {ordered.map((sticker, index) => (
            <StickerCard
              key={sticker.id}
              sticker={sticker}
              unlocked={unlockedSet.has(sticker.id)}
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

/**
 * Stagger cap: identical in shape to the previous framer delay progression
 * (index * ~30ms, capped so the 12th card doesn't wait half a second).
 */
const ENTRANCE_STAGGER_MS = 30;
const ENTRANCE_STAGGER_CAP_MS = 300;

function StickerCardImpl({ sticker, unlocked, index }: StickerCardProps) {
  const hash = useMemo(() => hashStickerId(sticker.id), [sticker.id]);
  const rotate = useMemo(() => rotationForId(sticker.id), [sticker.id]);

  // Hash-staggered idle-float tempo. Matches the old framer values byte-for-byte:
  //   floatDuration = 2.8..4.0s  (2.8 + (hash % 120)/100)
  //   floatDelay    = 0..1s      ((hash % 100)/100)
  const floatDuration = useMemo(() => `${(2.8 + (hash % 120) / 100).toFixed(2)}s`, [hash]);
  const floatDelay = useMemo(() => `${((hash % 100) / 100).toFixed(2)}s`, [hash]);
  const entranceDelay = useMemo(
    () => `${Math.min(index * ENTRANCE_STAGGER_MS, ENTRANCE_STAGGER_CAP_MS)}ms`,
    [index],
  );

  const cardStyle = useMemo<CSSProperties>(
    () => ({
      '--card-rotate': `${rotate}deg`,
      '--card-float-dur': floatDuration,
      '--card-float-delay': floatDelay,
      '--card-entrance-delay': entranceDelay,
    } as CSSProperties),
    [rotate, floatDuration, floatDelay, entranceDelay],
  );

  const isSuperuser = sticker.id === 'superuser';
  return (
    <article
      className={cn(
        'group relative border-2 border-dashed border-[var(--c-grid)]/30 rounded-sm shadow-md p-4 pt-6 flex flex-col items-center text-center font-hand',
        'sticker-card',
        unlocked ? 'sticker-card--unlocked' : 'sticker-card--locked',
        isSuperuser && unlocked && 'sticker-card--superuser',
        !isSuperuser && 'bg-[var(--c-paper)]',
      )}
      style={cardStyle}
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
    </article>
  );
}

/**
 * Custom comparator — store updates re-render the parent but we only want the
 * card to re-render when its own identity, lock state, or index changes.
 */
const StickerCard = memo(StickerCardImpl, (prev, next) =>
  prev.unlocked === next.unlocked &&
  prev.sticker.id === next.sticker.id &&
  prev.index === next.index,
);
