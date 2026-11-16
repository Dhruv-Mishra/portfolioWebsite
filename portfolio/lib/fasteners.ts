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
  /** Extra keyframes for parts of the fastener, keyed by class name. */
  parts?: Record<string, { off: Keyframe[]; on: Keyframe[] }>;
}

/** Tape rolls up toward its left end: scale about the left edge, then lift and tilt. */
const roll = (x: string, y: string, turn: number, sx: number, sy: number): Keyframe => ({
  transform: `translate(${x}, ${y}) rotate(${turn}deg) translateX(-50%) scale(${sx}, ${sy}) translateX(50%)`,
  // Wound-up tape is several layers thick, so it reads denser.
});
const TAPE_DOWN = roll('0px', '0px', 0, 1, 1);
const TAPE_ROLLED = roll('-.25rem', '-.2rem', -10, 0.22, 1.25);

const PIN_HOME = { translate: '0 0', scale: '1', rotate: '0deg' };
const PIN_LIFTED = { translate: '0 -.6rem', scale: '1.3', rotate: '-6deg' };
/** Laid on its side next to its hole, so it can go back in after. */
const PIN_ASIDE = { translate: '1.5rem .15rem', scale: '1', rotate: '68deg' };

const PEG_HOME = { translate: '0 0', rotate: '0deg', scale: '1' };
const PEG_OPEN = { translate: '0 -.3rem', rotate: '-6deg', scale: '1.06' };
const PEG_LOOSE = { translate: '0 -.08rem', rotate: '-3deg', scale: '1' };

const MOTIONS: Record<Kind, Motion> = {
  pin: {
    off: [PIN_HOME, { ...PIN_LIFTED, offset: 0.42 }, PIN_ASIDE],
    on: [PIN_ASIDE, { ...PIN_LIFTED, offset: 0.46 }, { ...PIN_HOME, scale: '.9', offset: 0.8 }, PIN_HOME],
    offMs: 360,
    onMs: 420,
    parts: {
      // The needle comes out of the cork as the head lifts, and goes back in.
      'pin-needle': {
        off: [{ scale: '1 0' }, { scale: '1 1', offset: 0.42 }, { scale: '1 1' }],
        on: [{ scale: '1 1' }, { scale: '1 1', offset: 0.46 }, { scale: '1 0', offset: 0.8 }, { scale: '1 0' }],
      },
      // Its shadow falls away and softens while it is held up.
      'pin-shadow': {
        off: [{ translate: '0 0', scale: '1', opacity: 1 }, { translate: '.45rem .55rem', scale: '1.5', opacity: 0.45, offset: 0.42 }, { translate: '0 0', scale: '1', opacity: 1 }],
        on: [{ translate: '0 0', scale: '1', opacity: 1 }, { translate: '.45rem .55rem', scale: '1.5', opacity: 0.45, offset: 0.46 }, { translate: '0 0', scale: '1', opacity: 1, offset: 0.8 }, { translate: '0 0', scale: '1', opacity: 1 }],
      },
    },
  },
  tape: {
    off: [TAPE_DOWN, { ...roll('0px', '-.1rem', -3, 0.62, 1.1), offset: 0.5 }, TAPE_ROLLED],
    on: [TAPE_ROLLED, { ...roll('0px', '-.1rem', -2, 0.7, 1.08), offset: 0.55 }, { ...roll('0px', '0px', 0, 1, 0.94), offset: 0.85 }, TAPE_DOWN],
    offMs: 300,
    onMs: 380,
  },
  clip: {
    off: [PEG_HOME, { ...PEG_OPEN, offset: 0.55 }, PEG_LOOSE],
    on: [PEG_LOOSE, { ...PEG_OPEN, offset: 0.45 }, { ...PEG_HOME, translate: '0 .1rem', offset: 0.78 }, PEG_HOME],
    offMs: 300,
    onMs: 360,
  },
};

const EASE = 'cubic-bezier(0.32, 0.72, 0.25, 1)';
/** The note may start to move once the fastener is this far through letting go. */
const LEAD = 0.72;

function kindOf(fastener: HTMLElement): Kind | null {
  const kind = fastener.dataset.fastener;
  return kind === 'pin' || kind === 'tape' || kind === 'clip' ? kind : null;
}

/** The fastener and its moving parts, each with its keyframes. */
function moving(fastener: HTMLElement, motion: Motion): Array<[HTMLElement, { off: Keyframe[]; on: Keyframe[] }]> {
  const list: Array<[HTMLElement, { off: Keyframe[]; on: Keyframe[] }]> = [[fastener, motion]];
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

/** Lets go; resolves when the note is free to move, a little before the fastener settles aside. */
export function release(fastener: HTMLElement | null): Promise<void> {
  const kind = fastener ? kindOf(fastener) : null;
  if (!fastener || !kind || fastener.dataset.off !== undefined) return Promise.resolve();
  const motion = MOTIONS[kind];
  fastener.dataset.off = '';
  settle(fastener);
  for (const [el, frames] of moving(fastener, motion)) {
    const animation = el.animate(frames.off, { duration: motion.offMs, easing: EASE, fill: 'forwards' });
    // The aside pose is then held as plain style, so nothing rests on a filling animation.
    void animation.finished.then(() => {
      if (fastener.dataset.off === undefined) return;
      animation.commitStyles();
      animation.cancel();
    }).catch(() => undefined);
  }
  return new Promise((resolve) => window.setTimeout(resolve, motion.offMs * LEAD));
}

/** Takes hold again. A pinned or taped note gives a little as it is pressed home; a pegged photo swings. */
export function secure(fastener: HTMLElement | null, note?: HTMLElement | null): Promise<void> {
  const kind = fastener ? kindOf(fastener) : null;
  if (!fastener || !kind || fastener.dataset.off === undefined) return Promise.resolve();
  const motion = MOTIONS[kind];
  delete fastener.dataset.off;
  settle(fastener);
  const [press] = moving(fastener, motion).map(([el, frames]) => el.animate(frames.on, { duration: motion.onMs, easing: EASE }));
  if (note && kind === 'clip') {
    const tilt = Number.parseFloat(getComputedStyle(note).rotate) || 0;
    const swing = [4, -2.5, 1.2, -0.4, 0].map((offset) => ({ rotate: `${tilt + offset}deg` }));
    note.animate(swing, { duration: 1100, delay: motion.onMs * 0.6, easing: 'ease-out' });
  } else {
    note?.animate([{ scale: '1' }, { scale: '1', offset: 0.74 }, { scale: '.985', offset: 0.84 }, { scale: '1' }], { duration: motion.onMs });
  }
  return press.finished.then(() => undefined, () => undefined);
}

/** Puts a fastener straight back without a motion (a forced close). */
export function reset(fastener: HTMLElement | null): void {
  if (!fastener) return;
  delete fastener.dataset.off;
  settle(fastener);
}
