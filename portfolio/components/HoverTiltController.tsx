'use client';

import { useEffect } from 'react';
import { FINE_POINTER_QUERY } from '@/hooks/useMediaQuery';

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

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function isMotionReduced(reducedMedia: MediaQueryList): boolean {
  const motionAttr = document.documentElement.dataset.motion;
  if (motionAttr === 'reduced') return true;
  if (motionAttr === 'full') return false;
  return reducedMedia.matches;
}

export default function HoverTiltController(): null {
  useEffect(() => {
    const finePointer = window.matchMedia(FINE_POINTER_QUERY);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    let active3dEl: HTMLElement | null = null;
    let activeRect: DOMRect | null = null;
    let activeMaxDeg = 3.5;
    let pendingX = 0;
    let pendingY = 0;
    let rafId = 0;

    const flush3dTilt = () => {
      rafId = 0;
      if (!active3dEl || !activeRect || activeRect.width <= 0 || activeRect.height <= 0) return;
      const nx = clamp((pendingX - activeRect.left) / activeRect.width - 0.5, -0.5, 0.5);
      const ny = clamp((pendingY - activeRect.top) / activeRect.height - 0.5, -0.5, 0.5);
      const rx = (-ny * activeMaxDeg * 2).toFixed(2);
      const ry = (nx * activeMaxDeg * 2).toFixed(2);
      const gx = ((nx + 0.5) * 100).toFixed(1);
      const gy = ((ny + 0.5) * 100).toFixed(1);
      active3dEl.style.setProperty('--tilt-rx', `${rx}deg`);
      active3dEl.style.setProperty('--tilt-ry', `${ry}deg`);
      active3dEl.style.setProperty('--tilt-gx', `${gx}%`);
      active3dEl.style.setProperty('--tilt-gy', `${gy}%`);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!active3dEl) return;
      pendingX = event.clientX;
      pendingY = event.clientY;
      if (!rafId) {
        rafId = window.requestAnimationFrame(flush3dTilt);
      }
    };

    const clearActive3d = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      document.removeEventListener('pointermove', onPointerMove);
      if (active3dEl) {
        delete active3dEl.dataset.tiltActive;
        active3dEl.style.setProperty('--tilt-rx', '0deg');
        active3dEl.style.setProperty('--tilt-ry', '0deg');
      }
      active3dEl = null;
      activeRect = null;
    };

    const engageActive3d = (el: HTMLElement, clientX: number, clientY: number) => {
      if (active3dEl === el) return;
      clearActive3d();
      active3dEl = el;
      activeRect = el.getBoundingClientRect();
      activeMaxDeg = el.dataset.tilt3d === 'foil' ? 6 : 3.5;
      el.dataset.tiltActive = '1';
      pendingX = clientX;
      pendingY = clientY;
      flush3dTilt();
      document.addEventListener('pointermove', onPointerMove, { passive: true });
    };

    const onPointerOver = (event: PointerEvent) => {
      if (!finePointer.matches || isMotionReduced(reducedMotion)) return;
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

      const next3d = target.closest<HTMLElement>('[data-tilt-3d]');
      if (next3d && !(related instanceof Node && next3d.contains(related))) {
        engageActive3d(next3d, event.clientX, event.clientY);
      }
    };

    const onPointerOut = (event: PointerEvent) => {
      if (!active3dEl) return;
      const related = event.relatedTarget;
      if (related instanceof Node && active3dEl.contains(related)) return;
      clearActive3d();
    };

    document.addEventListener('pointerover', onPointerOver, { passive: true });
    document.addEventListener('pointerout', onPointerOut, { passive: true });
    window.addEventListener('blur', clearActive3d);
    document.addEventListener('scroll', clearActive3d, { capture: true, passive: true });
    return () => {
      clearActive3d();
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      window.removeEventListener('blur', clearActive3d);
      document.removeEventListener('scroll', clearActive3d, { capture: true });
    };
  }, []);

  return null;
}
