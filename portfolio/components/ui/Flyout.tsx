"use client";

import { X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useEffectiveReducedMotion } from '@/hooks/useEffectiveReducedMotion';
import { useSitePrefs } from '@/hooks/useSitePrefs';
import { release, reset, secure, shownFastener } from '@/lib/fasteners';
import { boxOf, fly, rotationOf } from '@/lib/flight';
import { useAppHaptics } from '@/lib/haptics';
import { soundManager } from '@/lib/soundManager';
import './flyout.css';

type Phase = 'idle' | 'releasing' | 'opening' | 'open' | 'closing';

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const noteIn = (slot: HTMLElement | undefined) => slot?.querySelector<HTMLElement>('[data-flyout-note]') ?? null;

/**
 * Opens a note from a wall (the pin board, the photo line) into a reading sheet in the top layer. Its pin, tape or
 * peg lets go, the note flies to the middle of the screen, and closing flies it home and fastens it again. Each slot
 * holds a `[data-flyout-note]`, a `[data-flyout-open]` control and any `[data-fastener]`. The motion follows
 * Settings > Customization > Opening a note; reduced motion always fades.
 */
export function useFlyout() {
  const [openId, setOpenId] = useState<string | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const slots = useRef(new Map<string, HTMLElement>());
  const { noteFlight } = useSitePrefs();
  const reducedMotion = useEffectiveReducedMotion();
  const preferred = reducedMotion ? 'fade' : noteFlight;
  // A note closes the way it opened, even if the preference changes while it is out.
  const [mode, setMode] = useState(preferred);
  const { closePanel, openPanel, tap } = useAppHaptics();

  const slotRef = useCallback((id: string) => (node: HTMLElement | null) => {
    if (node) slots.current.set(id, node);
    else slots.current.delete(id);
  }, []);

  const open = useCallback(async (id: string) => {
    if (phaseRef.current !== 'idle') return;
    phaseRef.current = 'releasing';
    tap();
    setMode(preferred);
    if (preferred === 'pin') await release(shownFastener(slots.current.get(id)));
    phaseRef.current = 'opening';
    setOpenId(id);
  }, [preferred, tap]);

  // The sheet is rendered by now; show it in the top layer and fly it out of its note.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const sheet = sheetRef.current;
    const content = contentRef.current;
    const note = openId ? noteIn(slots.current.get(openId)) : null;
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
      // A forced close during the flight has already reset the wall.
      if (phaseRef.current === 'opening') phaseRef.current = 'open';
    });
  }, [openId, mode, openPanel]);

  const close = useCallback(async () => {
    const dialog = dialogRef.current;
    const sheet = sheetRef.current;
    const content = contentRef.current;
    const slot = openId ? slots.current.get(openId) : undefined;
    const note = noteIn(slot);
    if (!dialog || !sheet || !content || !slot || !note || phaseRef.current !== 'open') return;
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
      flight.cleanup();
    }
    delete note.dataset.away;
    slot.querySelector<HTMLElement>('[data-flyout-open]')?.focus({ preventScroll: true });
    setOpenId(null);
    const fastener = shownFastener(slot);
    if (fastener?.dataset.off !== undefined) {
      await secure(fastener, note);
      soundManager.play('terminal-click');
      tap();
    }
    phaseRef.current = 'idle';
  }, [openId, mode, closePanel, tap]);

  // A forced close (a second Escape, a same-page link, navigation) skips the flight; put the wall back as it was.
  const onClose = useCallback(() => {
    if (phaseRef.current === 'closing' || !openId) return;
    const slot = slots.current.get(openId);
    const note = noteIn(slot);
    if (note) delete note.dataset.away;
    slot?.querySelectorAll<HTMLElement>('[data-fastener]').forEach(reset);
    phaseRef.current = 'idle';
    setOpenId(null);
  }, [openId]);

  useEffect(() => () => {
    if (dialogRef.current?.open) dialogRef.current.close();
  }, []);

  return { openId, open, close: () => void close(), onClose, slotRef, mode, dialogRef, sheetRef, contentRef };
}

interface FlyoutDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  mode: string;
  labelledBy?: string;
  /** Flies the note home (backdrop click, Escape). */
  onDismiss: () => void;
  /** The dialog closed by any route; resets the wall if the flight was skipped. */
  onClose: () => void;
  children: ReactNode;
}

/** The top-layer dialog the sheet flies into. Same-page links and voice launchers inside it put the note away first. */
export function FlyoutDialog({ dialogRef, mode, labelledBy, onDismiss, onClose, children }: FlyoutDialogProps) {
  return (
    <dialog
      ref={dialogRef}
      className="flyout"
      data-mode={mode}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onDismiss();
          return;
        }
        // The dialog makes the page inert, so a link to elsewhere on it, or a voice call, needs the page back now.
        if ((event.target as Element).closest('a[href^="#"], [data-voice-launcher]')) event.currentTarget.close();
      }}
    >
      {children}
    </dialog>
  );
}

export function FlyoutClose({ onClose, label }: { onClose: () => void; label: string }) {
  return (
    <button type="button" className="flyout-close focus-ring" onClick={onClose} aria-label={label}>
      <X aria-hidden="true" />
    </button>
  );
}