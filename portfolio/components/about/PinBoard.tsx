"use client";

import { X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useEffectiveReducedMotion } from '@/hooks/useEffectiveReducedMotion';
import { useSitePrefs } from '@/hooks/useSitePrefs';
import { boxOf, fly, rotationOf } from '@/lib/flight';
import { useAppHaptics } from '@/lib/haptics';
import { soundManager } from '@/lib/soundManager';
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

type Phase = 'idle' | 'pulling' | 'opening' | 'open' | 'closing';

/** Where a pulled pin is set down: beside its hole, so it can go back in after. */
const PIN_ASIDE = { translate: '1.75rem -0.25rem', rotate: '34deg' } as const;
const PIN_HOME = { translate: '0 0', scale: '1', rotate: '0deg' } as const;

function pullPin(pin: HTMLElement): Animation {
  return pin.animate([
    PIN_HOME,
    { translate: '0 -0.7rem', scale: '1.32', rotate: '-8deg', offset: 0.42 },
    { ...PIN_ASIDE, scale: '1' },
  ], { duration: 380, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)', fill: 'forwards' });
}

function pressPin(pin: HTMLElement, note: HTMLElement): Promise<void> {
  pin.getAnimations().forEach((animation) => animation.cancel());
  const press = pin.animate([
    { ...PIN_ASIDE, scale: '1' },
    { translate: '0 -0.75rem', scale: '1.34', rotate: '-6deg', offset: 0.48 },
    { translate: '0 0', scale: '0.88', rotate: '0deg', offset: 0.8 },
    PIN_HOME,
  ], { duration: 440, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
  // The note gives a little as the pin goes home.
  note.animate([{ scale: '1' }, { scale: '1', offset: 0.76 }, { scale: '0.985', offset: 0.84 }, { scale: '1' }], { duration: 440 });
  return press.finished.then(() => undefined, () => undefined);
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * A cork board of notes. Opening one pulls its pin and flies the note to the middle of the screen as a reading
 * sheet; closing flies it back and pins it again. The flight style follows Settings > Look and feel > Opening a note.
 */
export default function PinBoard({ notes }: { notes: readonly BoardNote[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const noteRefs = useRef(new Map<string, HTMLElement>());
  const pinRefs = useRef(new Map<string, HTMLElement>());
  const openerRefs = useRef(new Map<string, HTMLButtonElement>());
  const { noteFlight } = useSitePrefs();
  const reducedMotion = useEffectiveReducedMotion();
  const mode = reducedMotion ? 'fade' : noteFlight;
  const { closePanel, openPanel, tap } = useAppHaptics();
  const openNote = notes.find((note) => note.id === openId) ?? null;

  const open = useCallback(async (id: string) => {
    if (phaseRef.current !== 'idle') return;
    const pin = pinRefs.current.get(id);
    // offsetParent is null when the pin is hidden (the "On the page" layout uses tape).
    if (mode === 'pin' && pin?.offsetParent) {
      phaseRef.current = 'pulling';
      tap();
      await pullPin(pin).finished.catch(() => undefined);
    }
    phaseRef.current = 'opening';
    setOpenId(id);
  }, [mode, tap]);

  // The sheet is rendered by now; show it in the top layer and fly it out of its note.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const sheet = sheetRef.current;
    const content = contentRef.current;
    const note = openId ? noteRefs.current.get(openId) : null;
    if (!openId || !dialog || !sheet || !content || !note || phaseRef.current !== 'opening') return;
    dialog.showModal();
    dialog.dataset.state = 'open';
    soundManager.play('modal-open');
    openPanel();
    if (mode === 'fade') {
      phaseRef.current = 'open';
      return;
    }
    const flight = fly({ sheet, face: note, from: boxOf(note, rotationOf(note, 0)), content: [content] });
    note.dataset.away = '';
    void flight.finished.then(() => {
      flight.cleanup();
      // A forced close during the flight has already reset the board.
      if (phaseRef.current === 'opening') phaseRef.current = 'open';
    });
  }, [openId, mode, openPanel]);

  const close = useCallback(async () => {
    const dialog = dialogRef.current;
    const sheet = sheetRef.current;
    const content = contentRef.current;
    const id = openId;
    const note = id ? noteRefs.current.get(id) : null;
    if (!id || !dialog || !sheet || !content || !note || phaseRef.current !== 'open') return;
    phaseRef.current = 'closing';
    dialog.dataset.state = 'closing';
    soundManager.play('modal-close');
    closePanel();
    if (mode === 'fade') {
      await wait(160);
      dialog.close();
    } else {
      const flight = fly({ sheet, face: note, from: boxOf(note, rotationOf(note, 0)), content: [content], back: true });
      await flight.finished;
      dialog.close();
      delete note.dataset.away;
      flight.cleanup();
    }
    openerRefs.current.get(id)?.focus({ preventScroll: true });
    setOpenId(null);
    const pin = pinRefs.current.get(id);
    if (mode === 'pin' && pin?.offsetParent) {
      await pressPin(pin, note);
      soundManager.play('terminal-click');
      tap();
    }
    phaseRef.current = 'idle';
  }, [openId, mode, closePanel, tap]);

  // A forced close (a second Escape, navigation) skips the flight; put everything back as it was.
  const onDialogClose = useCallback(() => {
    if (phaseRef.current === 'closing' || !openId) return;
    const note = noteRefs.current.get(openId);
    if (note) delete note.dataset.away;
    pinRefs.current.get(openId)?.getAnimations().forEach((animation) => animation.cancel());
    phaseRef.current = 'idle';
    setOpenId(null);
  }, [openId]);

  useEffect(() => () => {
    if (dialogRef.current?.open) dialogRef.current.close();
  }, []);

  return (
    <>
      <ul className="board-notes">
        {notes.map((note, index) => {
          const Heading = note.heading ?? 'h2';
          return (
            <li key={note.id} id={note.anchor} className="board-slot" data-note={note.id} style={{ '--tilt': `${note.tilt}deg`, '--i': index } as CSSProperties}>
              <span aria-hidden="true" className="board-ghost" />
              <article
                ref={(node) => { if (node) noteRefs.current.set(note.id, node); else noteRefs.current.delete(note.id); }}
                className="board-note note-material"
                data-note={note.id}
                data-paper={note.paper}
                data-torn-edge={note.torn}
                data-torn-host={note.torn ? '' : undefined}
                aria-labelledby={`board-${note.id}-title`}
              >
                <Heading id={`board-${note.id}-title`} className="board-note-title font-hand ink-heavy">{note.title}</Heading>
                <div className={note.clamp ? 'board-note-body board-note-body--clamped' : 'board-note-body'}>{note.body}</div>
                <button
                  ref={(node) => { if (node) openerRefs.current.set(note.id, node); else openerRefs.current.delete(note.id); }}
                  type="button"
                  className="board-note-open font-hand focus-ring"
                  aria-haspopup={note.action ? undefined : 'dialog'}
                  aria-describedby={`board-${note.id}-title`}
                  onClick={() => (note.action === 'voice' ? requestVoiceMode({ source: 'resume', topic: 'about' }) : void open(note.id))}
                >
                  {note.cta}
                </button>
              </article>
              <span
                ref={(node) => { if (node) pinRefs.current.set(note.id, node); else pinRefs.current.delete(note.id); }}
                aria-hidden="true"
                className="pushpin board-pin"
                data-color={note.pin}
              />
              <span aria-hidden="true" data-tape-strip className="board-tape" />
            </li>
          );
        })}
      </ul>

      <dialog
        ref={dialogRef}
        className="board-dialog"
        data-mode={mode}
        aria-labelledby={openNote ? `board-${openNote.id}-sheet` : undefined}
        onCancel={(event) => {
          event.preventDefault();
          void close();
        }}
        onClose={onDialogClose}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            void close();
            return;
          }
          // A link to elsewhere on this page, or a voice call, needs the page back: put the note away at once.
          if ((event.target as Element).closest('a[href^="#"], [data-voice-launcher]')) dialogRef.current?.close();
        }}
      >
        {openNote ? (
          <article ref={sheetRef} className="board-sheet note-material" data-paper={openNote.paper} data-torn-edge={openNote.torn}>
            <div ref={contentRef} className="board-sheet-content">
              <button type="button" className="board-sheet-close focus-ring" onClick={() => void close()} aria-label="Close note">
                <X aria-hidden="true" />
              </button>
              <h2 id={`board-${openNote.id}-sheet`} className="board-sheet-title font-hand ink-heavy">{openNote.title}</h2>
              <div className="board-sheet-body">{openNote.body}</div>
              {openNote.more ? <div className="board-sheet-more">{openNote.more}</div> : null}
            </div>
          </article>
        ) : null}
      </dialog>
    </>
  );
}
