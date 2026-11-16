/**
 * Container-transform flights between a small card on the page and the large sheet it opens into.
 * Only translate/scale/rotate and opacity animate, so the work stays on the compositor. A clone of the card's face
 * rides on the sheet and cross-fades with the sheet's own content, so the card appears to grow into the sheet.
 */

export interface Box {
  /** Centre in viewport px. */
  x: number;
  y: number;
  /** Layout size, before any rotation. */
  w: number;
  h: number;
  rotate: number;
}

export function boxOf(el: HTMLElement, rotate = 0): Box {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w: el.offsetWidth, h: el.offsetHeight, rotate };
}

/** The on-screen tilt of `el`: its own `rotate` plus its ancestors' up to `depth` levels (cards tilt via their list item). */
export function rotationOf(el: Element, depth = 1): number {
  let total = 0;
  let node: Element | null = el;
  for (let level = 0; node && level <= depth; level += 1, node = node.parentElement) {
    total += Number.parseFloat(getComputedStyle(node).rotate) || 0;
  }
  return total;
}

/** A damped spring sampled into a CSS `linear()` easing, with the time it takes to settle. */
function spring(stiffness: number, damping: number): { easing: string; ms: number } {
  const w0 = Math.sqrt(stiffness);
  const zeta = damping / (2 * w0);
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const at = (t: number) => 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t));
  let settle = 0.2;
  while (settle < 3 && Math.exp(-zeta * w0 * settle) > 0.002) settle += 0.02;
  const points = Array.from({ length: 41 }, (_, i) => at((i / 40) * settle).toFixed(4));
  points[40] = '1';
  return { easing: `linear(${points.join(', ')})`, ms: Math.round(settle * 1000) };
}

const SPRING = spring(210, 22);
const supportsLinear = () => typeof CSS !== 'undefined' && CSS.supports('animation-timing-function', 'linear(0, 1)');

export const FLIGHT = {
  /** Out to the sheet: a soft spring that settles without a visible wobble. */
  get outEasing() { return supportsLinear() ? SPRING.easing : 'cubic-bezier(0.22, 1, 0.36, 1)'; },
  outMs: Math.min(SPRING.ms, 620),
  /** Back to the page: accelerate away, then ease into place. */
  backEasing: 'cubic-bezier(0.45, 0, 0.2, 1)',
  backMs: 460,
};

function cloneFace(face: HTMLElement, from: Box, to: Box): HTMLElement {
  const clone = face.cloneNode(true) as HTMLElement;
  for (const node of [clone, ...clone.querySelectorAll<HTMLElement>('[id], [data-project-slug], [data-away]')]) {
    node.removeAttribute('id');
    node.removeAttribute('data-project-slug');
    node.removeAttribute('data-away');
  }
  clone.inert = true;
  clone.setAttribute('aria-hidden', 'true');
  Object.assign(clone.style, {
    position: 'absolute',
    inset: '0 auto auto 0',
    margin: '0',
    width: `${from.w}px`,
    height: `${from.h}px`,
    transformOrigin: '0 0',
    transform: 'none',
    translate: 'none',
    rotate: 'none',
    scale: `${to.w / from.w} ${to.h / from.h}`,
    pointerEvents: 'none',
    animation: 'none',
  });
  return clone;
}

/**
 * The clone leaves the page, so it would lose container-query styles. Its host re-creates the nearest query
 * container at the same width, and carries the custom properties the card inherits.
 */
function faceHost(face: HTMLElement, clone: HTMLElement): HTMLElement {
  const host = document.createElement('div');
  const inherited = getComputedStyle(face);
  let container = face.parentElement;
  while (container && getComputedStyle(container).containerType === 'normal') container = container.parentElement;
  const style: Partial<CSSStyleDeclaration> = { position: 'absolute', inset: '0 auto auto 0', height: '0', zIndex: '20', pointerEvents: 'none' };
  if (container) {
    const box = getComputedStyle(container);
    style.width = `${container.clientWidth - Number.parseFloat(box.paddingLeft) - Number.parseFloat(box.paddingRight)}px`;
    style.containerType = box.containerType;
    style.containerName = box.containerName;
  }
  Object.assign(host.style, style);
  for (const name of FACE_VARS) host.style.setProperty(name, inherited.getPropertyValue(name));
  host.append(clone);
  return host;
}

/** Custom properties cards inherit from their list item that change how the face looks. */
const FACE_VARS = ['--photo-tilt', '--tape-x', '--torn-x', '--tilt', '--accent'] as const;

export interface FlightOptions {
  /** Laid out at its final, open position. */
  sheet: HTMLElement;
  /** The card on the page; its clone rides the sheet. */
  face: HTMLElement;
  from: Box;
  /** Elements of the sheet that fade in as the face fades out. */
  content: readonly HTMLElement[];
  /** Fly the open sheet back into `from`. */
  back?: boolean;
  /** The sheet's own resting rotation. */
  restRotate?: number;
}

export interface Flight {
  finished: Promise<void>;
  /** Removes the clone and the held end state; call once whatever replaces the flight is in place. */
  cleanup: () => void;
}

/** The newest flight on each sheet; an older flight's cleanup must not end a newer one. */
const latestFlight = new WeakMap<HTMLElement, object>();

export function fly({ sheet, face, from, content, back = false, restRotate = 0 }: FlightOptions): Flight {
  const token = {};
  latestFlight.set(sheet, token);
  // Set before measuring: they switch off the sheet's own entrance animation, which would skew its resting box.
  sheet.dataset.flying = '';
  sheet.dataset.flown = '';
  const to = boxOf(sheet, restRotate);
  const away = { translate: `${from.x - to.x}px ${from.y - to.y}px`, scale: `${from.w / to.w} ${from.h / to.h}`, rotate: `${from.rotate}deg` };
  const home = { translate: '0px 0px', scale: '1 1', rotate: `${restRotate}deg` };
  const duration = back ? FLIGHT.backMs : FLIGHT.outMs;
  const timing = { duration, fill: 'both' as const };
  const clone = cloneFace(face, from, to);
  const host = faceHost(face, clone);
  sheet.append(host);

  const animations = [
    sheet.animate(back ? [home, away] : [away, home], { ...timing, easing: back ? FLIGHT.backEasing : FLIGHT.outEasing }),
    clone.animate(back
      ? [{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1, offset: 0.8 }, { opacity: 1 }]
      : [{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }], timing),
    ...content.map((el) => el.animate(back
      ? [{ opacity: 1 }, { opacity: 0, offset: 0.3 }, { opacity: 0 }]
      : [{ opacity: 0 }, { opacity: 0, offset: 0.25 }, { opacity: 1, offset: 0.7 }, { opacity: 1 }], timing)),
  ];

  return {
    finished: Promise.all(animations.map((animation) => animation.finished)).then(() => undefined, () => undefined),
    cleanup: () => {
      host.remove();
      if (latestFlight.get(sheet) === token) delete sheet.dataset.flying;
      for (const animation of animations) animation.cancel();
    },
  };
}
