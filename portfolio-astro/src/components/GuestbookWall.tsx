import { GuestbookNote } from '@/components/GuestbookNote';
import type { GuestbookEntry } from '@/lib/guestbook';
import { cn } from '@/lib/utils';

interface GuestbookWallProps {
  entries: GuestbookEntry[];
}

/**
 * Renders the masonry-style wall of approved guestbook entries.
 *
 * Server component: no hover/animation state lives here — entrance animations run purely
 * via CSS (`animate-wall-note-in` defined in globals.css). Child `<GuestbookNote>` is a
 * memoized client component but does not own any local state that would cause churn.
 *
 * Layout uses CSS columns for a true masonry effect without JS measurement. `break-inside-avoid`
 * on each `<li>` keeps individual notes from splitting across column boundaries.
 */
export default function GuestbookWall({ entries }: GuestbookWallProps) {
  const wallWidthClass = entries.length <= 1
    ? 'max-w-sm columns-1'
    : entries.length === 2
      ? 'max-w-3xl columns-1 sm:columns-2'
      : entries.length === 3
        ? 'max-w-5xl columns-1 sm:columns-2 lg:columns-3'
        : 'max-w-7xl columns-1 sm:columns-2 lg:columns-3 xl:columns-4';

  return (
    <ul
      role="list"
      className={cn('mx-auto gap-x-10 md:gap-x-14 mt-12', wallWidthClass)}
    >
      {entries.map((entry, index) => (
        <li key={entry.id} className="break-inside-avoid mb-10 md:mb-14 mx-auto max-w-sm">
          <GuestbookNote entry={entry} index={index} />
        </li>
      ))}
    </ul>
  );
}
