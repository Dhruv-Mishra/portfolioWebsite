'use client';

import { useEffect } from 'react';

const FINE_POINTER = '(hover: hover) and (pointer: fine)';

let rng = 0x9e3779b9;

function nextUnit(): number {
  rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
  return rng / 0x100000000;
}

function nextTilt(): string {
  const magnitude = 0.25 + nextUnit() * 0.55;
  const sign = nextUnit() < 0.5 ? -1 : 1;
  return `${(sign * magnitude).toFixed(2)}deg`;
}

export default function HoverTiltController(): null {
  useEffect(() => {
    const finePointer = window.matchMedia(FINE_POINTER);

    const onPointerOver = (event: PointerEvent) => {
      if (!finePointer.matches) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const related = event.relatedTarget;
      let el = target.closest<HTMLElement>('[data-hover-tilt]');
      while (el) {
        // Ignore child↔child moves; only retilt on true boundary entry.
        if (!(related instanceof Node && el.contains(related))) {
          el.style.setProperty('--hover-tilt', nextTilt());
        }
        el = el.parentElement?.closest<HTMLElement>('[data-hover-tilt]') ?? null;
      }
    };

    document.addEventListener('pointerover', onPointerOver, { passive: true });
    return () => document.removeEventListener('pointerover', onPointerOver);
  }, []);

  return null;
}
