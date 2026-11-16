/**
 * Focus the site moves for the user (into a dialog, back to the note or card it opened from) shows a ring only for
 * keyboard users; after a tap or click a ring around the opener reads as a stray selection box. Chrome ignores
 * `focus({ focusVisible: false })`, so the element is marked `data-quiet-focus` until it blurs, and the ring rules
 * skip it. The next Tab moves focus on and brings the ring back. The input mode comes from lib/haptics.ts, which
 * tracks it from page load, so dialogs whose code loads late still know how they were opened.
 */
import { lastInputWasKeyboard } from '@/lib/haptics';

export function moveFocus(el: HTMLElement | null | undefined): void {
  if (!el) return;
  if (!lastInputWasKeyboard() && el.dataset.quietFocus === undefined) {
    el.dataset.quietFocus = '';
    el.addEventListener('blur', () => delete el.dataset.quietFocus, { once: true });
  }
  el.focus({ preventScroll: true });
}
