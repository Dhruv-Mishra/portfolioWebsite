"use client";

/**
 * useKonamiCode — listens for the Konami sequence and emits a sticker
 * when the user enters: ↑ ↑ ↓ ↓ ← → ← → B A.
 *
 * The listener is suppressed while focus is in a text-entry surface
 * (input, textarea, contenteditable) to avoid hijacking real typing.
 */
import { useEffect } from 'react';
import { stickerBus } from '@/lib/stickerBus';

const SEQUENCE: readonly string[] = [
  'ArrowUp', 'ArrowUp',
  'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight',
  'ArrowLeft', 'ArrowRight',
  'b', 'a',
];

function normalizeKey(raw: string): string {
  // Arrow keys we match case-exact; letters we lowercase.
  if (raw.startsWith('Arrow')) return raw;
  return raw.toLowerCase();
}

function isTextFocus(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKonamiCode(): void {
  useEffect(() => {
    let progress = 0;

    const handler = (e: KeyboardEvent): void => {
      if (isTextFocus(e.target)) {
        progress = 0;
        return;
      }
      const key = normalizeKey(e.key);
      const expected = SEQUENCE[progress];
      if (key === expected) {
        progress += 1;
        if (progress === SEQUENCE.length) {
          stickerBus.emit('konami');
          progress = 0;
        }
      } else {
        // Allow the first key to re-seed the sequence mid-typing
        progress = key === SEQUENCE[0] ? 1 : 0;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
