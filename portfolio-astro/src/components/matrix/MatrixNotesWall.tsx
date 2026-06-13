'use client';

/**
 * MatrixNotesWall — the wall body shown to unlocked users on `/matrix-notes`.
 *
 * Lazy-loaded by `MatrixNotesGate` only after the localStorage unlock check
 * succeeds. Fetches approved entries + filler notes from
 * `/api/matrix-notes` (which merges them server-side) and renders a
 * matrix-themed list of note cards plus a submission form.
 *
 * Visual identity: emerald-on-charcoal glyph-rain theme, distinct from the
 * guestbook's paper-and-tape aesthetic. Cards are framed in thin emerald
 * borders with a very subtle character-grid background; signers render
 * mono-coded; timestamps sit unobtrusively. No tape. This is the
 * other-side-of-the-curtain look — and it should feel earned.
 *
 * Accessibility:
 *   - `role="list"` + `<li>` per note.
 *   - Form inputs have ≥16px font-size so iOS Safari doesn't auto-zoom.
 *   - Tap targets ≥44×44 CSS px.
 *   - Focus rings use a matrix-emerald ring so the dark background keeps
 *     AA contrast on the visible indicator.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { GuestbookEntry } from '@/lib/guestbook';
import { formatRelativeOrShort } from '@/lib/guestbook';
import MatrixNotesForm from './MatrixNotesForm';

interface ListResponse {
  entries: GuestbookEntry[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; entries: GuestbookEntry[] }
  | { status: 'error'; message: string };

/**
 * Small helper — stable date formatting via the existing relative-or-short
 * helper used by the guestbook. `suppressHydrationWarning` is applied at the
 * element level because server HTML here is just the 404 shell; there is no
 * hydration mismatch to guard against, but it's cheap belt-and-suspenders.
 */
function useFetchNotes(version: number): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetch('/api/matrix-notes', { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as Partial<ListResponse>;
        if (cancelled) return;
        const entries = Array.isArray(data.entries) ? data.entries : [];
        setState({ status: 'ready', entries });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return state;
}

export default function MatrixNotesWall(): React.ReactElement {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const state = useFetchNotes(refreshVersion);

  const onSubmitted = useCallback(() => {
    // Bump the version — the `useFetchNotes` effect re-runs and re-loads.
    // New submissions go to the pending queue so they won't appear until
    // Dhruv approves; the fresh list still helps if other entries just
    // got approved.
    setRefreshVersion((v) => v + 1);
  }, []);

  return (
    <main
      className="relative min-h-[100dvh] pt-16 md:pt-12 pb-24 px-4 md:px-8"
      style={{
        // Pure black base + subtle matrix glyph-grid via layered gradients.
        // Cheaper than a canvas and renders identically on iOS.
        background:
          'radial-gradient(ellipse at 20% -10%, rgba(16,185,129,0.08) 0%, transparent 50%),' +
          'radial-gradient(ellipse at 80% 110%, rgba(16,185,129,0.06) 0%, transparent 50%),' +
          '#050b08',
        color: '#d1fae5',
        // Contain: lets the browser skip painting offscreen children while
        // the list is long.
        contain: 'layout paint',
      }}
    >
      {/* Decorative grid overlay — 0.03 alpha emerald lines. Pointer-events
          none so it never interferes with form taps. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(16,185,129,0.045) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(16,185,129,0.045) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse at center, black 50%, transparent 95%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 50%, transparent 95%)',
        }}
      />

      <div className="relative max-w-4xl mx-auto">
        <header className="text-center">
          <p className="font-code text-xs md:text-sm tracking-[0.35em] text-emerald-400/70 uppercase">
            /transmission · signal acquired
          </p>
          <h1 className="mt-3 font-hand text-4xl md:text-6xl font-bold text-emerald-200">
            notes from the other side
          </h1>
          <p className="mt-3 font-hand text-lg md:text-xl text-emerald-300/70 max-w-xl mx-auto">
            You escaped. Leave something behind for the next person who figures it out.
          </p>
        </header>

        {/* Submission form */}
        <section aria-label="Post a note" className="mt-10 md:mt-14">
          <MatrixNotesForm onSubmitted={onSubmitted} />
        </section>

        {/* Wall */}
        <section aria-label="Escape notes wall" className="mt-14 md:mt-20">
          {state.status === 'loading' && (
            <p className="text-center font-code text-sm text-emerald-300/60">
              decoding transmissions…
            </p>
          )}
          {state.status === 'error' && (
            <p className="text-center font-code text-sm text-rose-300/70">
              signal lost. try refreshing.
            </p>
          )}
          {state.status === 'ready' && (
            <MatrixNotesList entries={state.entries} />
          )}
        </section>

        {/* Back link — home with a matrix-voice label. */}
        <div className="mt-16 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 min-h-[44px] px-5 font-code text-sm tracking-wider text-emerald-300/80 hover:text-emerald-200 border border-emerald-500/30 hover:border-emerald-400/70 rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            <span aria-hidden="true">←</span> return to the sketchbook
          </Link>
        </div>
      </div>
    </main>
  );
}

// ─── Notes list ─────────────────────────────────────────────────────────

interface MatrixNotesListProps {
  entries: GuestbookEntry[];
}

function MatrixNotesList({ entries }: MatrixNotesListProps): React.ReactElement {
  if (entries.length === 0) {
    return (
      <p className="text-center font-code text-sm text-emerald-300/60">
        nobody else has been through yet. you&apos;re first.
      </p>
    );
  }
  return (
    <ul role="list" className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      {entries.map((entry, idx) => (
        <li key={entry.id}>
          <MatrixNoteCard entry={entry} index={idx} />
        </li>
      ))}
    </ul>
  );
}

// ─── Individual note card ───────────────────────────────────────────────

interface MatrixNoteCardProps {
  entry: GuestbookEntry;
  index: number;
}

function MatrixNoteCard({ entry, index }: MatrixNoteCardProps): React.ReactElement {
  // Small rotation + stagger so the grid has visual variety without feeling
  // chaotic. Hash off the id for stability.
  const rotation = ((entry.id % 7) - 3) * 0.15; // -0.45..+0.45 deg
  const delay = Math.min(index * 40, 320);
  const formatted = formatRelativeOrShort(entry.createdAt);

  return (
    <article
      className="relative rounded-md border border-emerald-500/25 bg-emerald-950/25 backdrop-blur-[1px] p-5 md:p-6 shadow-[0_8px_24px_-16px_rgba(16,185,129,0.35)] transition-[transform,border-color] duration-200 hover:border-emerald-400/55 focus-within:border-emerald-400/70"
      style={{
        transform: `rotate(${rotation}deg) translate3d(0,0,0)`,
        animation: `matrix-note-in 380ms cubic-bezier(0.2,0.9,0.35,1) ${delay}ms both`,
      }}
    >
      {/* Top-left prompt glyph for the matrix vibe. Monospace, dim. */}
      <span
        aria-hidden="true"
        className="absolute -top-2.5 left-4 px-1.5 font-code text-[10px] tracking-widest text-emerald-400/60"
        style={{ background: '#050b08' }}
      >
        ~$
      </span>

      <p className="font-hand text-base md:text-lg leading-relaxed text-emerald-100/95 whitespace-pre-wrap break-words">
        {entry.message}
      </p>

      <div className="mt-4 pt-3 border-t border-emerald-500/15 flex items-center justify-between gap-3">
        <span className="font-code text-xs md:text-sm text-emerald-300/80 truncate">
          — {entry.name || 'anonymous'}
        </span>
        <time
          dateTime={entry.createdAt}
          className="font-code text-[10px] md:text-xs text-emerald-400/50 whitespace-nowrap"
          suppressHydrationWarning
        >
          {formatted}
        </time>
      </div>
    </article>
  );
}
