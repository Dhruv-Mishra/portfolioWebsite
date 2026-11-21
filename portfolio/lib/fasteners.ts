/**
 * What holds a note up: a push pin, a strip of tape or a clothes peg, marked `data-fastener="pin|tape|clip"`.
 * `release` lets go before the note flies off; `secure` takes hold again once it is back. Only transform and
 * opacity animate, so every motion stays on the compositor.
 */

type Kind = 'pin' | 'tape' | 'clip';

interface Motion {
  off: Keyframe[];
  on: Keyframe[];
  offMs: number;
  onMs: number;
  /** How far through letting go the note is free to move: the needle is out, the tape's end is up. */
  lead: number;
  /** When, through taking hold, the fastener presses the note against the wall. */
  press: number;
  /** Extra keyframes for parts of the fastener, keyed by class name. */
  parts?: Record<string, { off: Keyframe[]; on: Keyframe[] }>;
}

const PIN_HOME = { translate: '0 0', scale: '1', rotate: '0deg' };
/** Laid on its side next to its hole, needle toward it, so it can go back in after. */
const PIN_ASIDE = { translate: '1.6rem .3rem', scale: '1', rotate: '72deg' };
const SHADOW_REST = { translate: '0 0', scale: '1', opacity: 1 };
const SHADOW_HELD = { translate: '.5rem .7rem', scale: '1.5', opacity: 0.4 };

const PEG_HOME = { translate: '0 0', rotate: '0deg', scale: '1' };
const PEG_OPEN = { translate: '0 -.3rem', rotate: '-6deg', scale: '1.06' };
const PEG_LOOSE = { translate: '0 -.08rem', rotate: '-3deg', scale: '1' };

const SETTLE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const SWING = 'cubic-bezier(0.45, 0, 0.55, 1)';
const DROP = 'cubic-bezier(0.55, 0, 0.85, 0.35)';

// The coil is always tangent to the end of the stuck tail, including on the way back down.
const tail = (fraction: number, offset: number, easing: string) => ({ transform: `scaleX(${fraction})`, offset, easing });
const edge = (fraction: number, offset: number, easing: string) => ({ transform: `translateX(${fraction * 100}%)`, offset, easing });
const travel = (at: typeof tail) => ({
  off: [at(1, 0, SWING), at(.93, .18, SWING), at(.08, .87, SETTLE), at(.055, 1, SETTLE)],
  on: [at(.055, 0, SWING), at(.08, .13, SWING), at(.93, .82, SETTLE), at(1, 1, SETTLE)],
});
const coil = (size: number, tilt: number, opacity: number, offset: number, easing: string) => ({
  transform: `scale(${size}, ${.58 + .42 * size}) rotate(${tilt}deg)`, opacity, offset, easing,
});

const MOTIONS: Record<Kind, Motion> = {
  pin: {
    // Worked loose with a small wiggle, pulled straight out, carried over in an arc and laid on its side.
    off: [
      { ...PIN_HOME, easing: SWING },
      { translate: '0 0', scale: '1.02', rotate: '-9deg', offset: 0.12, easing: SWING },
      { translate: '0 -.05rem', scale: '1.04', rotate: '7deg', offset: 0.26, easing: SETTLE },
      { translate: '0 -.65rem', scale: '1.24', rotate: '-3deg', offset: 0.48, easing: SWING },
      { translate: '1.05rem -.6rem', scale: '1.16', rotate: '42deg', offset: 0.74, easing: DROP },
      { translate: '1.6rem .3rem', scale: '.96', rotate: '74deg', offset: 0.92, easing: SETTLE },
      PIN_ASIDE,
    ],
    // Picked up, held over its hole, pushed in with a little squash, and it springs back.
    on: [
      { ...PIN_ASIDE, easing: SETTLE },
      { translate: '1rem -.6rem', scale: '1.18', rotate: '38deg', offset: 0.3, easing: SWING },
      { translate: '0 -.7rem', scale: '1.24', rotate: '-2deg', offset: 0.56, easing: DROP },
      { translate: '0 .06rem', scale: '.9', rotate: '0deg', offset: 0.76, easing: SETTLE },
      { translate: '0 0', scale: '1.04', rotate: '0deg', offset: 0.88, easing: SWING },
      PIN_HOME,
    ],
    offMs: 520,
    onMs: 480,
    lead: 0.48,
    press: 0.76,
    parts: {
      // The needle slides out of the cork as the pin is pulled, and back in as it is pushed.
      'pin-needle': {
        off: [{ scale: '1 0' }, { scale: '1 0', offset: 0.26, easing: SWING }, { scale: '1 1', offset: 0.48 }, { scale: '1 1' }],
        on: [{ scale: '1 1' }, { scale: '1 1', offset: 0.56, easing: SETTLE }, { scale: '1 0', offset: 0.76 }, { scale: '1 0' }],
      },
      // Its shadow falls away and softens while it is held up, and gathers under it again on the cork.
      'pin-shadow': {
        off: [SHADOW_REST, { ...SHADOW_REST, offset: 0.26, easing: SWING }, { ...SHADOW_HELD, offset: 0.48 }, { ...SHADOW_HELD, offset: 0.74, easing: DROP }, { ...SHADOW_REST, opacity: 0.8, offset: 0.92 }, { ...SHADOW_REST, opacity: 0.8 }],
        on: [{ ...SHADOW_REST, opacity: 0.8, easing: SETTLE }, { ...SHADOW_HELD, offset: 0.3 }, { ...SHADOW_HELD, offset: 0.56, easing: DROP }, { ...SHADOW_REST, scale: '.85', offset: 0.76, easing: SETTLE }, SHADOW_REST],
      },
    },
  },
  tape: {
    off: [], on: [],
    offMs: 380, onMs: 400, lead: .81, press: .87,
    parts: {
      'tape-tail': travel(tail),
      'tape-track': travel(edge),
      'tape-coil': {
        off: [coil(.025, 12, 0, 0, SETTLE), coil(.35, 4, 1, .18, SWING), coil(1, -5, 1, .87, SETTLE), coil(.97, -2, 1, 1, SETTLE)],
        on: [coil(.97, -2, 1, 0, SWING), coil(1, -5, 1, .13, SWING), coil(.35, 4, 1, .82, SETTLE), coil(.025, 12, 0, 1, SETTLE)],
      },
    },
  },
  clip: {
    off: [{ ...PEG_HOME, easing: SETTLE }, { ...PEG_OPEN, offset: 0.5, easing: SWING }, PEG_LOOSE],
    on: [{ ...PEG_LOOSE, easing: SETTLE }, { ...PEG_OPEN, offset: 0.4, easing: DROP }, { ...PEG_HOME, translate: '0 .1rem', offset: 0.74, easing: SETTLE }, PEG_HOME],
    offMs: 340,
    onMs: 380,
    lead: 0.5,
    press: 0.74,
  },
};

function kindOf(fastener: HTMLElement): Kind | null {
  const kind = fastener.dataset.fastener;
  return kind === 'pin' || kind === 'tape' || kind === 'clip' ? kind : null;
}

/** The fastener and its moving parts, each with its keyframes. */
function moving(fastener: HTMLElement, motion: Motion): Array<[HTMLElement, { off: Keyframe[]; on: Keyframe[] }]> {
  const list: Array<[HTMLElement, { off: Keyframe[]; on: Keyframe[] }]> = motion.off.length ? [[fastener, motion]] : [];
  for (const [part, frames] of Object.entries(motion.parts ?? {})) {
    const el = fastener.querySelector<HTMLElement>(`.${part}`);
    if (el) list.push([el, frames]);
  }
  return list;
}

const MOVED = ['transform', 'translate', 'rotate', 'scale', 'opacity'] as const;

/** Back to the resting style: no running motion and no held end state. */
function settle(fastener: HTMLElement) {
  for (const el of [fastener, ...fastener.querySelectorAll<HTMLElement>('*')]) {
    for (const animation of el.getAnimations()) animation.cancel();
    for (const property of MOVED) el.style.removeProperty(property);
  }
}

/** The fastener of a slot that is actually shown (a slot can carry a pin and tape for different layouts). */
export function shownFastener(slot: Element | null | undefined): HTMLElement | null {
  if (!slot) return null;
  for (const fastener of slot.querySelectorAll<HTMLElement>('[data-fastener]')) {
    if (fastener.getClientRects().length > 0) return fastener;
  }
  return null;
}

/** Lets go; resolves when the note is free to move, while the fastener is still being set aside. */
export function release(fastener: HTMLElement | null): Promise<void> {
  const kind = fastener ? kindOf(fastener) : null;
  if (!fastener || !kind || fastener.dataset.off !== undefined) return Promise.resolve();
  const motion = MOTIONS[kind];
  fastener.dataset.off = '';
  settle(fastener);
  for (const [el, frames] of moving(fastener, motion)) {
    const animation = el.animate(frames.off, { duration: motion.offMs, fill: 'forwards' });
    // The aside pose is then held as plain style, so nothing rests on a filling animation.
    void animation.finished.then(() => {
      if (fastener.dataset.off === undefined) return;
      animation.commitStyles();
      animation.cancel();
    }).catch(() => undefined);
  }
  return new Promise((resolve) => window.setTimeout(resolve, motion.offMs * motion.lead));
}

/** Takes hold again. A pinned or taped note gives a little as it is pressed home; a pegged photo swings. */
export function secure(fastener: HTMLElement | null, note?: HTMLElement | null): Promise<void> {
  const kind = fastener ? kindOf(fastener) : null;
  if (!fastener || !kind || fastener.dataset.off === undefined) return Promise.resolve();
  const motion = MOTIONS[kind];
  delete fastener.dataset.off;
  settle(fastener);
  const [press] = moving(fastener, motion).map(([el, frames]) => el.animate(frames.on, { duration: motion.onMs }));
  if (note && kind === 'clip') {
    const tilt = Number.parseFloat(getComputedStyle(note).rotate) || 0;
    const swing = [4, -2.5, 1.2, -0.4, 0].map((offset) => ({ rotate: `${tilt + offset}deg` }));
    note.animate(swing, { duration: 1100, delay: motion.onMs * motion.press, easing: 'ease-out' });
  } else {
    const at = motion.press;
    note?.animate([{ scale: '1' }, { scale: '1', offset: at - 0.04 }, { scale: '.985', offset: at + 0.06, easing: SETTLE }, { scale: '1' }], { duration: motion.onMs });
  }
  return press.finished.then(() => undefined, () => undefined);
}

/** Puts a fastener straight back without a motion (a forced close). */
export function reset(fastener: HTMLElement | null): void {
  if (!fastener) return;
  delete fastener.dataset.off;
  settle(fastener);
}
