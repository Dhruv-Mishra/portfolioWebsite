'use client';

/**
 * ClickSoundListener — attaches ONE delegated click listener on document
 * and fires the `button-click` sound when the click originated from an
 * element marked `data-clickable` or one of a small allow-list of primary
 * button roles.
 *
 * Why delegated? Zero per-component wiring. Adding `data-clickable` to any
 * future button gets the tick for free.
 *
 * Debounce is enforced by the sound manager (80ms). We additionally skip:
 *   - keyboard clicks (Enter / Space) — the terminal already has its own
 *     typewriter sound; we don't want to double-up.
 *   - clicks inside the Terminal container (its submit has its own
 *     terminal-click cue).
 *   - clicks on the SoundToggleButton itself (it plays an ack tick in its
 *     handler already, and its click IS a mute toggle so doubling would
 *     also fire the pre-toggle click).
 */

import { useEffect } from 'react';
import { soundManager } from '@/lib/soundManager';

export default function ClickSoundListener(): null {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    function shouldFire(target: Element | null): boolean {
      if (!target) return false;
      // Find the closest element that either IS clickable or descends from one.
      // We only accept elements marked data-clickable.
      const clickable = target.closest('[data-clickable]');
      if (!clickable) return false;
      // Skip our own toggle.
      if (clickable.closest('[data-sound-toggle]')) return false;
      // Skip anything inside the terminal — terminal has its own sound.
      if (clickable.closest('[aria-label="Terminal Command Input"], form > input, .font-code')) {
        // Allow normal clickable buttons that happen to be inside code-styled
        // surfaces; only skip when we're inside the terminal form row.
        const terminalForm = clickable.closest('form');
        if (terminalForm?.querySelector('[aria-label="Terminal Command Input"]')) {
          return false;
        }
      }
      return true;
    }

    const handler = (evt: MouseEvent): void => {
      // Ignore pseudo-clicks fired by keyboard (detail === 0). Keyboard
      // activations travel through different sound cues.
      if (evt.detail === 0) return;
      const target = evt.target as Element | null;
      if (!shouldFire(target)) return;
      soundManager.play('button-click');
    };

    document.addEventListener('click', handler, { capture: true, passive: true });
    return () => document.removeEventListener('click', handler, { capture: true });
  }, []);

  return null;
}
