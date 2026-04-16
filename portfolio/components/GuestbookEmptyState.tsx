import { HandDrawnArrow } from '@/components/SketchbookDoodles';
import { TapeStrip } from '@/components/ui/TapeStrip';
import { WavyUnderline } from '@/components/ui/WavyUnderline';

/**
 * Empty state for the guestbook wall — a mini staged scene shown when no
 * approved entries exist yet. A handwritten arrow points up toward the
 * submission form, a muted placeholder sticky hangs below it with three
 * decorative wavy strokes, and an italic caption sits underneath.
 *
 * Pure server component — no interactivity, no state.
 */
export function GuestbookEmptyState() {
  return (
    <div
      className="relative flex flex-col items-center justify-center min-h-[40vh] mt-10 md:mt-14 pb-6"
      role="status"
      aria-label="No guestbook entries yet"
    >
      {/* Handwritten arrow pointing up to the form */}
      <HandDrawnArrow
        className="w-24 md:w-28 h-16 md:h-20 text-[var(--c-ink)] opacity-40 -rotate-[135deg] mb-4 md:mb-6"
      />

      {/* Tilted placeholder sticky — muted yellow at 40% opacity */}
      <article
        className="relative bg-[var(--note-yellow)] p-5 pb-7 md:p-6 md:pb-8 shadow-md border border-yellow-300/30 dark:border-yellow-400/20 font-hand text-[var(--c-ink)] rotate-[-3deg] opacity-40 w-full max-w-xs"
        aria-hidden="true"
      >
        <TapeStrip size="sm" />
        <div className="space-y-4 text-[var(--c-ink)]/70">
          <WavyUnderline />
          <WavyUnderline />
          <WavyUnderline />
        </div>
      </article>

      {/* Italic caption */}
      <p className="font-hand italic text-lg md:text-xl text-[var(--c-ink)] opacity-60 mt-5 md:mt-6">
        be the first to sign ~
      </p>
    </div>
  );
}
