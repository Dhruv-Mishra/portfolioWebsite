"use client";

/**
 * StickerGlanceBadge — the tilted index-card near the top-left binding that
 * shows `{unlocked}/{total} pinned` and routes to /stickers. Pulses a dot
 * when a new sticker has been earned since the last album visit.
 *
 * Mounted by EagerEnhancements (site-wide, except /stickers which we skip
 * inline to avoid a self-referential pulse).
 */
import { memo, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStickerProgress } from '@/hooks/useStickers';
import { useAppHaptics } from '@/lib/haptics';
import { STICKER_FAMILIES, Z_INDEX } from '@/lib/designTokens';
import { Tooltip } from '@/components/ui/Tooltip';

const StickerStackGlyph = memo(function StickerStackGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="9" cy="10" r="6.5" fill={STICKER_FAMILIES.denim.bg} stroke={STICKER_FAMILIES.denim.ink} strokeWidth="1.5" />
      <circle cx="15" cy="13" r="6.5" fill={STICKER_FAMILIES.sunshine.bg} stroke={STICKER_FAMILIES.sunshine.ink} strokeWidth="1.5" />
      <circle cx="12" cy="17" r="5.5" fill={STICKER_FAMILIES.rose.bg} stroke={STICKER_FAMILIES.rose.ink} strokeWidth="1.5" />
    </svg>
  );
});

export default function StickerGlanceBadge(): React.ReactElement | null {
  const pathname = usePathname();
  // Narrow subscription: re-renders only when { unlocked count, total,
  // hasUnseenSticker } changes. Toast queue churn, visitedRoute mutations,
  // and unlockedAt timestamp updates are all filtered by the store's cached
  // progress reference. A toast dequeue does not re-render this badge.
  const { unlocked, total, hasUnseenSticker } = useStickerProgress();
  const { navigate } = useAppHaptics();
  const [hiddenFor, setHiddenFor] = useState<{ pathname: string; unlocked: number } | null>(null);
  const isVisible = hiddenFor?.pathname !== pathname || hiddenFor?.unlocked !== unlocked;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setHiddenFor({ pathname, unlocked }), 6000);
    return () => window.clearTimeout(timeoutId);
  }, [pathname, unlocked]);

  // Hide ON the album page itself to keep the route focused.
  if (!isVisible || pathname === '/stickers') return null;
  // Mobile declutter: the badge is desktop-only on non-home routes. We
  // still render on the homepage for mobile because that's the primary
  // discovery surface; everywhere else only desktop gets the badge.
  const desktopOnly = pathname !== '/';

  return (
    <Tooltip label={`Sticker album — ${unlocked}/${total} pinned`}>
    <Link
      href="/stickers"
      onClick={navigate}
      aria-label={`${unlocked}/${total} stickers pinned — open sticker drawer`}
      title={`${unlocked}/${total} pinned`}
      className={`fixed bottom-[var(--c-mobile-dock-bottom)] md:bottom-auto md:top-4 left-[calc(var(--c-binding-w)+0.75rem)] md:left-[calc(var(--c-binding-w-md)+1rem)] -rotate-2 bg-[var(--c-paper)] border-2 border-dashed border-[var(--c-grid)]/50 rounded shadow-md min-h-11 pl-2.5 pr-3 py-1.5 ${desktopOnly ? 'hidden md:flex' : 'flex'} items-center gap-1.5 font-hand text-sm font-bold text-[var(--c-ink)] transition-transform duration-200 hover:scale-105 hover:-rotate-1 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-ink)]/40`}
      style={{ zIndex: Z_INDEX.sidebar }}
      data-disco-bounce="3"
    >
      <StickerStackGlyph size={18} />
      <span aria-hidden="true">
        {unlocked}/{total}
      </span>
      {hasUnseenSticker && (
        <span
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full shadow border-2 border-emerald-500 bg-emerald-300 animate-pulse"
          aria-hidden="true"
        />
      )}
    </Link>
    </Tooltip>
  );
}
