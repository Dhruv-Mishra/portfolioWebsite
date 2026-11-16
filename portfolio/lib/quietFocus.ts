/**
 * Focus the site moves for the user (into a dialog, back to the note or card it opened from) shows a ring only for
 * keyboard users; after a tap or click a ring around the opener reads as a stray selection box. Chrome ignores
 * `focus({ focusVisible: false })`, so the element is marked `data-quiet-focus` until it blurs, and the ring rules
 * skip it. The next Tab moves focus on and brings the ring back.
 */
let keyboard = false;

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (event) => {
    if (!event.metaKey && !event.ctrlKey && !event.altKey) keyboard = true;
  }, { capture: true, passive: true });
  document.addEventListener('pointerdown', () => {
    keyboard = false;
  }, { capture: true, passive: true });
}

export function moveFocus(el: HTMLElement | null | undefined): void {
  if (!el) return;
  if (!keyboard && el.dataset.quietFocus === undefined) {
    el.dataset.quietFocus = '';
    el.addEventListener('blur', () => delete el.dataset.quietFocus, { once: true });
  }
  el.focus({ preventScroll: true });
}
