import Link from 'next/link';
import { WavyUnderline } from '@/components/ui/WavyUnderline';
import GuestbookForm from '@/components/GuestbookForm';
import GuestbookPendingEmptyGate from '@/components/GuestbookPendingEmptyGate';
import GuestbookPendingNotes from '@/components/GuestbookPendingNotes';
import GuestbookWall from '@/components/GuestbookWall';
import { GuestbookEmptyState } from '@/components/GuestbookEmptyState';
import { GUESTBOOK_LIMITS } from '@/lib/designTokens';
import type { GuestbookEntry } from '@/lib/guestbook';

interface GuestbookPageProps {
  entries: GuestbookEntry[];
  currentPage: number;
}

export default function GuestbookPage({ entries, currentPage }: GuestbookPageProps) {
  const pageSize = GUESTBOOK_LIMITS.notesPerPage;
  const offset = (currentPage - 1) * pageSize;
  const pageEntries = entries.slice(offset, offset + pageSize);
  const hasMore = entries.length > offset + pageSize;
  const isEmpty = entries.length === 0;
  const noteCount = entries.length;

  return (
    <div className="max-w-7xl mx-auto pt-16 md:pt-10 pb-24 px-4 md:px-8">
      <header className="text-center">
        <h1 className="font-hand text-4xl md:text-5xl font-bold text-[var(--c-heading)] inline-block">
          Guestbook
        </h1>
        <WavyUnderline className="max-w-xs mx-auto" />
        <p className="font-hand text-lg opacity-60 mt-2">
          leave your mark on the wall ~
        </p>

        {!isEmpty && (
          <p className="font-hand text-xs opacity-40 mt-2">
            {noteCount} {noteCount === 1 ? 'note' : 'notes'} pinned
            <span className="mx-2" aria-hidden="true">.</span>
            <Link href="/stickers" className="underline decoration-dotted underline-offset-4 hover:opacity-100 transition-opacity">
              try the sticker drawer -&gt;
            </Link>
          </p>
        )}
      </header>

      <div className="mt-8 md:mt-10">
        <GuestbookForm />
      </div>

      <GuestbookPendingNotes approvedEntries={entries} />

      {isEmpty ? (
        <GuestbookPendingEmptyGate>
          <GuestbookEmptyState />
        </GuestbookPendingEmptyGate>
      ) : (
        <>
          <GuestbookWall entries={pageEntries} />

          {(hasMore || currentPage > 1) && (
            <nav aria-label="Guestbook pagination" className="flex flex-wrap justify-center items-center gap-4 md:gap-6 mt-16">
              {currentPage > 1 && (
                <Link
                  href={currentPage === 2 ? '/guestbook' : `/guestbook?page=${currentPage - 1}`}
                  className="group relative bg-[var(--note-yellow)] border border-yellow-300/40 dark:border-yellow-400/20 px-4 py-2 shadow-sm font-hand text-sm md:text-base text-[var(--c-ink)] min-h-[44px] inline-flex items-center gap-1 rotate-[-1.5deg] hover:rotate-0 hover:shadow-md transition-[transform,box-shadow,opacity] opacity-80 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-ink)]/50"
                >
                  <span aria-hidden="true">&lt;-</span> newer notes
                </Link>
              )}
              {hasMore && (
                <Link
                  href={`/guestbook?page=${currentPage + 1}`}
                  className="group relative bg-[var(--note-orange)] border border-orange-300/40 dark:border-orange-400/20 px-4 py-2 shadow-sm font-hand text-sm md:text-base text-[var(--c-ink)] min-h-[44px] inline-flex items-center gap-1 rotate-[1.5deg] hover:rotate-0 hover:shadow-md transition-[transform,box-shadow,opacity] opacity-80 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-ink)]/50"
                >
                  see older notes <span aria-hidden="true">-&gt;</span>
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}