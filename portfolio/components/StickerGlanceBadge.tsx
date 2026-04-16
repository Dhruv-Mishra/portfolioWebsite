"use client";

/**
 * StickerGlanceBadge — the tilted index-card near the top-left binding that
 * shows `{unlocked}/{total} pinned` and routes to /stickers. Pulses a dot
 * when a new sticker has been earned since the last album visit.
 *
 * Mounted by EagerEnhancements (site-wide, except /stickers which we skip
 * inline to avoid a self-referential pulse).
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStickers } from '@/hooks/useStickers';
import { useAppHaptics } from '@/lib/haptics';
import { StickerStackGlyph } from '@/lib/stickers';
import { Z_INDEX } from '@/lib/designTokens';

export default function StickerGlanceBadge(): React.ReactElement | null {
  const pathname = usePathname();
  const { unlocked, total, hasUnseenSticker } = useStickers();
  const { navigate } = useAppHaptics();

  // Hide ON the album page itself to keep the route focused.
  if (pathname === '/stickers') return null;

  return (
    <Link
      href="/stickers"
      onClick={navigate}
      aria-label={`Sticker drawer — ${unlocked.length} of ${total} pinned`}
      title={`${unlocked.length}/${total} pinned`}
      className="fixed bottom-20 md:bottom-auto md:top-4 left-[calc(var(--c-binding-w)+0.75rem)] md:left-[calc(var(--c-binding-w-md)+1rem)] -rotate-2 bg-[var(--c-paper)] border-2 border-dashed border-[var(--c-grid)]/50 rounded shadow-md pl-2 pr-3 py-1.5 flex items-center gap-1.5 font-hand text-sm font-bold text-[var(--c-ink)] transition-transform duration-200 hover:scale-105 hover:-rotate-1 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-ink)]/40"
      style={{ zIndex: Z_INDEX.sidebar }}
    >
      <StickerStackGlyph size={18} />
      <span aria-hidden="true">
        {unlocked.length}/{total}
      </span>
      {hasUnseenSticker && (
        <span
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full shadow border-2 border-emerald-500 bg-emerald-300 animate-pulse"
          aria-hidden="true"
        />
      )}
    </Link>
  );
}
