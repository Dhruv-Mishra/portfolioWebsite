"use client";

import type { CSSProperties, ReactNode } from 'react';
import { FlyoutClose, FlyoutDialog, useFlyout } from '@/components/ui/Flyout';
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
  /** Instead of opening a sheet, start a voice call. */
  action?: 'voice';
  tilt: number;
}

/**
 * A cork board of notes. Opening one pulls its pin (or peels its tape, when the notes lie on the page) and flies
 * the note to the middle of the screen as a reading sheet; closing flies it back and fastens it again.
 */
export default function PinBoard({ notes }: { notes: readonly BoardNote[] }) {
  const { openId, open, close, onClose, slotRef, mode, dialogRef, sheetRef, contentRef } = useFlyout();
  const openNote = notes.find((note) => note.id === openId) ?? null;

  return (
    <>
      <ul className="board-notes">
        {notes.map((note, index) => {
          const Heading = note.heading ?? 'h2';
          return (
            <li
              key={note.id}
              ref={slotRef(note.id)}
              id={note.anchor}
              className="board-slot"
              data-note={note.id}
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
                <div className={note.clamp ? 'board-note-body board-note-body--clamped' : 'board-note-body'}>{note.body}</div>
                <button
                  type="button"
                  className="board-note-open font-hand focus-ring"
                  data-flyout-open
                  aria-haspopup={note.action ? undefined : 'dialog'}
                  aria-describedby={`board-${note.id}-title`}
                  onClick={() => (note.action === 'voice' ? requestVoiceMode({ source: 'resume', topic: 'about' }) : void open(note.id))}
                >
                  {note.cta}
                </button>
              </article>
              <span aria-hidden="true" className="pushpin board-pin" data-fastener="pin" data-color={note.pin}>
                <span className="pin-shadow" />
                <span className="pin-needle" />
                <span className="pin-head" />
              </span>
              <span aria-hidden="true" data-tape-strip data-fastener="tape" className="board-tape" />
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
