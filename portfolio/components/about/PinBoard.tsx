"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { FlyoutClose, FlyoutDialog, useFlyout } from '@/components/ui/Flyout';
import { NoteTape } from '@/components/ui/NoteTape';
import { requestVoiceMode } from '@/lib/voiceModeStore';
import './pinboard.css';

export type BoardPaper = 'note' | 'index' | 'kraft' | 'blue' | 'pink' | 'photo';

export interface BoardNote {
  id: string;
  /** Optional fragment id for deep links (e.g. /about#resume). */
  anchor?: string;
  title: string;
  /** The page title lives on the first note; the open sheet always uses h2. */
  heading?: 'h1' | 'h2';
  paper: BoardPaper;
  pin: 'red' | 'amber' | 'blue' | 'green' | 'white';
  torn?: 'top' | 'bottom';
  /** Shown on the board (clamped when `clamp` is set) and in full on the open sheet. */
  body: ReactNode;
  /** Only on the open sheet. */
  more?: ReactNode;
  clamp?: boolean;
  /** Visible label of the stretched open control. */
  cta: string;
  /** Label instead of `cta` when a clamped body has room to show all of itself. */
  ctaFits?: string;
  /** Instead of opening a sheet, start a voice call. */
  action?: 'voice';
  tilt: number;
}

/** Ids of clamped notes whose whole body fits; the rest fade out where the text is cut. */
function useFittingNotes() {
  const listRef = useRef<HTMLUListElement>(null);
  const [fitting, setFitting] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const bodies = [...list.querySelectorAll<HTMLElement>('[data-clamp]')];
    const measure = () => {
      const next = bodies.filter((body) => body.scrollHeight <= body.clientHeight + 1).map((body) => body.dataset.clamp as string);
      setFitting((current) => (next.length === current.size && next.every((id) => current.has(id)) ? current : new Set(next)));
    };
    // The paragraphs are observed too: a late web font reflows them inside a body whose box stays the same.
    const observer = new ResizeObserver(measure);
    for (const body of bodies) {
      observer.observe(body);
      for (const child of body.children) observer.observe(child);
    }
    return () => observer.disconnect();
  }, []);

  return { listRef, fitting };
}

/** The note a link points at (`/about#resume`), circled in marker. Client navigations change the hash without `:target`. */
function useFlaggedNote(notes: readonly BoardNote[]) {
  const [flagged, setFlagged] = useState<string | null>(null);

  useEffect(() => {
    const anchors = new Set(notes.flatMap((note) => (note.anchor ? [note.anchor] : [])));
    const read = () => {
      try {
        const id = decodeURIComponent(window.location.hash.slice(1));
        setFlagged(anchors.has(id) ? id : null);
      } catch {
        setFlagged(null);
      }
    };
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    read();
    window.addEventListener('hashchange', read);
    navigation?.addEventListener('currententrychange', read);
    return () => {
      window.removeEventListener('hashchange', read);
      navigation?.removeEventListener('currententrychange', read);
    };
  }, [notes]);

  return flagged;
}

/**
 * A cork board of notes. Opening one pulls its pin (or peels its tape, when the notes lie on the page) and flies
 * the note to the middle of the screen as a reading sheet; closing flies it back and fastens it again.
 */
export default function PinBoard({ notes }: { notes: readonly BoardNote[] }) {
  const { openId, open, close, onClose, slotRef, mode, dialogRef, sheetRef, contentRef } = useFlyout();
  const { listRef, fitting } = useFittingNotes();
  const flagged = useFlaggedNote(notes);
  const openNote = notes.find((note) => note.id === openId) ?? null;

  return (
    <>
      <ul ref={listRef} className="board-notes">
        {notes.map((note, index) => {
          const Heading = note.heading ?? 'h2';
          const fits = fitting.has(note.id);
          return (
            <li
              key={note.id}
              ref={slotRef(note.id)}
              id={note.anchor}
              className="board-slot"
              data-note={note.id}
              data-flagged={note.anchor && note.anchor === flagged ? '' : undefined}
              style={{ '--tilt': `${note.tilt}deg`, '--i': index } as CSSProperties}
            >
              <span aria-hidden="true" className="board-ghost" />
              <article
                className="board-note note-material"
                data-flyout-note
                data-note={note.id}
                data-paper={note.paper}
                data-torn-edge={note.torn}
                data-torn-host={note.torn ? '' : undefined}
                aria-labelledby={`board-${note.id}-title`}
              >
                <Heading id={`board-${note.id}-title`} className="board-note-title font-hand ink-heavy">{note.title}</Heading>
                {note.clamp ? (
                  <div className="board-note-body board-note-body--clamped" data-clamp={note.id} data-clipped={fits ? undefined : ''}>{note.body}</div>
                ) : (
                  <div className="board-note-body">{note.body}</div>
                )}
                <button
                  type="button"
                  className="board-note-open font-hand focus-ring"
                  data-flyout-open
                  aria-haspopup={note.action ? undefined : 'dialog'}
                  aria-describedby={`board-${note.id}-title`}
                  onClick={() => (note.action === 'voice' ? requestVoiceMode({ source: 'resume', topic: 'about' }) : void open(note.id))}
                >
                  {fits && note.ctaFits ? note.ctaFits : note.cta}
                </button>
              </article>
              <span aria-hidden="true" className="pushpin board-pin" data-fastener="pin" data-color={note.pin}>
                <span className="pin-shadow" />
                <span className="pin-needle" />
                <span className="pin-head" />
              </span>
              <NoteTape className="board-tape" />
            </li>
          );
        })}
      </ul>

      <FlyoutDialog dialogRef={dialogRef} mode={mode} onDismiss={close} onClose={onClose} labelledBy={openNote ? `board-${openNote.id}-sheet` : undefined}>
        {openNote ? (
          <article ref={sheetRef} className="flyout-sheet board-sheet note-material" data-paper={openNote.paper} data-torn-edge={openNote.torn}>
            <div ref={contentRef} className="board-sheet-content">
              <FlyoutClose onClose={close} label="Close note" />
              <h2 id={`board-${openNote.id}-sheet`} className="board-sheet-title font-hand ink-heavy">{openNote.title}</h2>
              <div className="board-sheet-body">{openNote.body}</div>
              {openNote.more ? <div className="board-sheet-more">{openNote.more}</div> : null}
            </div>
          </article>
        ) : null}
      </FlyoutDialog>
    </>
  );
}
