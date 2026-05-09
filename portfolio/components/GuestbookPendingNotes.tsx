"use client";

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Clock3 } from 'lucide-react';
import { TapeStrip } from '@/components/ui/TapeStrip';
import {
  GUESTBOOK_PENDING_CHANGED_EVENT,
  GUESTBOOK_PENDING_STORAGE_KEY,
  getPendingGuestbookEntries,
  removeApprovedPendingGuestbookEntries,
  setPendingGuestbookEntries,
  type PendingGuestbookEntry,
} from '@/lib/guestbookPending';
import { formatRelativeOrShort, type GuestbookEntry } from '@/lib/guestbook';
import { cn } from '@/lib/utils';

interface GuestbookPendingNotesProps {
  approvedEntries: GuestbookEntry[];
}

function syncPendingEntries(approvedEntries: readonly GuestbookEntry[]): PendingGuestbookEntry[] {
  const storedEntries = getPendingGuestbookEntries();
  const visibleEntries = removeApprovedPendingGuestbookEntries(storedEntries, approvedEntries);

  if (visibleEntries.length !== storedEntries.length) {
    setPendingGuestbookEntries(visibleEntries);
  }

  return visibleEntries;
}

export default function GuestbookPendingNotes({ approvedEntries }: GuestbookPendingNotesProps) {
  const [pendingEntries, setPendingEntries] = useState<PendingGuestbookEntry[]>([]);

  const refreshPendingEntries = useCallback(() => {
    setPendingEntries(syncPendingEntries(approvedEntries));
  }, [approvedEntries]);

  useEffect(() => {
    refreshPendingEntries();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === GUESTBOOK_PENDING_STORAGE_KEY) refreshPendingEntries();
    };

    window.addEventListener(GUESTBOOK_PENDING_CHANGED_EVENT, refreshPendingEntries);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(GUESTBOOK_PENDING_CHANGED_EVENT, refreshPendingEntries);
      window.removeEventListener('storage', handleStorage);
    };
  }, [refreshPendingEntries]);

  if (pendingEntries.length === 0) return null;

  return (
    <section className="mt-10 md:mt-12" aria-label="Pending guestbook notes" aria-live="polite">
      <ul role="list" className="flex flex-wrap justify-center gap-5 md:gap-6">
        {pendingEntries.map((entry, index) => (
          <li key={entry.id} className="w-full max-w-sm">
            <article
              data-disco-motion="wiggle"
              style={{ '--disco-motion-delay': `${index * 120}ms` } as CSSProperties}
              className={cn(
                'relative w-full max-w-full bg-[var(--note-orange)] text-[var(--c-ink)]',
                'border border-orange-300/40 dark:border-orange-400/25 shadow-md',
                'font-hand p-5 pt-7 pb-8 rotate-1 overflow-hidden',
              )}
            >
              <TapeStrip size="sm" />
              <div className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[var(--c-paper)]/70 px-2 py-1 font-code text-[10px] uppercase tracking-wide text-[var(--c-ink)]/70">
                <Clock3 size={12} aria-hidden="true" />
                <span className="truncate">pending approval</span>
              </div>
              <p className="mt-3 max-h-[168px] overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-base leading-relaxed">
                {entry.message}
              </p>
              <div className="absolute bottom-2 inset-x-4 flex min-w-0 items-center justify-between gap-3 font-hand text-[10px] opacity-50">
                <time dateTime={entry.createdAt} suppressHydrationWarning>
                  {formatRelativeOrShort(entry.createdAt)}
                </time>
                <span className="min-w-0 flex-1 truncate text-right italic" title={entry.name || 'Anonymous'}>
                  - {entry.name || 'Anonymous'}
                </span>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
