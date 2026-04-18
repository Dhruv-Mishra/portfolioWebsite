/**
 * Matrix-notes filler seed.
 *
 * Rendered on `/matrix-notes` alongside (above — newest-first sort by
 * createdAt) any approved user-submitted notes. The filler entries give the
 * page visual weight and set the voice on the very first visit, before any
 * real escapees have posted.
 *
 * Voice brief: in-character but tasteful — Matrix-adjacent nods (Neo /
 * Trinity / Morpheus as signers, "wake up" / "the red pill" cadence) without
 * reciting the film. Lean toward thoughtful one-liners rather than quotes.
 *
 * IDs are intentionally NEGATIVE so they cannot collide with GitHub issue
 * numbers (always positive). `createdAt` is a hand-picked set of fixed ISO
 * timestamps spread across a few weeks so the existing `formatRelativeOrShort`
 * helper renders them as short absolute dates ("Mar 28") rather than
 * fluctuating relative labels that would change per page load.
 */
import type { GuestbookEntry } from '@/lib/guestbook';

export const MATRIX_FILLER_NOTES: readonly GuestbookEntry[] = [
  {
    id: -1001,
    name: 'Neo',
    message:
      'I kept thinking the bug was in the code. Turned out the bug was the assumption that the code was the whole story.',
    createdAt: '2026-03-12T18:22:00.000Z',
  },
  {
    id: -1002,
    name: 'Trinity',
    message:
      'The terminal only looks small until you remember the whole site fits inside it. Unplug occasionally — everything you love is still there when you come back.',
    createdAt: '2026-03-19T11:05:00.000Z',
  },
  {
    id: -1003,
    name: 'Morpheus',
    message:
      'Free your mind. Also, free your dependencies — you do not need another npm install to build something small and good.',
    createdAt: '2026-03-28T08:47:00.000Z',
  },
  {
    id: -1004,
    name: 'the architect',
    message:
      'You read the hint, typed the command, clicked the button. That is not a glitch. That is curiosity. Keep it.',
    createdAt: '2026-04-03T22:14:00.000Z',
  },
  {
    id: -1005,
    name: 'a quiet escapee',
    message:
      'Wrote this at 2am, on the other side. Same laptop. Same coffee. Slightly different angle on the day ahead.',
    createdAt: '2026-04-09T06:31:00.000Z',
  },
] as const;
