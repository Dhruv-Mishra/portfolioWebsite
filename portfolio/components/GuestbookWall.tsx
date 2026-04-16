import { GuestbookNote } from '@/components/GuestbookNote';
import type { GuestbookEntry } from '@/lib/guestbook';

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
  return (
    <ul
      role="list"
      className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-x-10 md:gap-x-14 mt-12"
    >
      {entries.map((entry, index) => (
        <li key={entry.id} className="break-inside-avoid mb-10 md:mb-14">
          <GuestbookNote entry={entry} index={index} />
        </li>
      ))}
    </ul>
  );
}
