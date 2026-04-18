"use client";

/**
 * DiscoSparkleCanvas — fixed full-viewport canvas that renders a particle
 * system while disco mode is on.
 *
 * Particles are drawn in three shapes — doodle stars, confetti squares, and
 * tiny specks — colored from the rainbow palette. Density scales down on
 * mobile to respect the perf budget, and the rAF loop parks itself while the
 * tab is hidden to avoid burning cycles off-screen.
 *
 * The canvas sits BELOW content but ABOVE the paper texture, using the shared
 * `mix-blend-mode: screen` so the sparkles add light rather than blocking it.
 *
 * Mount contract: caller only renders this component while disco is on. The
 * rAF loop is torn down on unmount; no orphan frames.
 *
 * Particle math (spawn + step + count) lives in `lib/discoSparkleUtils.ts` so
 * it can be exercised in a pure-node test environment. This file owns the
 * canvas side-effects (context, draw routines, rAF loop).
 */

import { useEffect, useRef } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  spawnParticle,
  stepParticle,
  particleCountForViewport,
  type Particle,
} from '@/lib/discoSparkleUtils';

// ─── Draw routines ─────────────────────────────────────────────────────
function drawStar(ctx: CanvasRenderingContext2D, p: Particle, alpha: number): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = p.color;
  ctx.fillStyle = p.color;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  const s = p.size;
  ctx.beginPath();
  ctx.moveTo(-s, 0);
  ctx.quadraticCurveTo(0, 0, s, 0);
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(0, 0, 0, s);
  ctx.moveTo(-s * 0.6, -s * 0.6);
  ctx.lineTo(s * 0.6, s * 0.6);
  ctx.moveTo(s * 0.6, -s * 0.6);
  ctx.lineTo(-s * 0.6, s * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawConfetti(ctx: CanvasRenderingContext2D, p: Particle, alpha: number): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p.color;
  const w = p.size;
  const h = p.size * 0.55;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawSpeck(ctx: CanvasRenderingContext2D, p: Particle, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ─── Component ────────────────────────────────────────────────────────
export default function DiscoSparkleCanvas(): React.ReactElement | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Cap the backing-store resolution aggressively on mobile. A retina
    // 390x844 viewport at dpr=3 would be ~2.96M pixels — the clear + draw cost
    // per frame is non-trivial. Capping at 1 keeps each frame to a ~330K-pixel
    // fill, which on a 4x-throttled CPU is what turns 24fps into 50+fps.
    const dpr = isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    const resize = (): void => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const targetCount = particleCountForViewport(width, height, isMobile);

    const particles: Particle[] = [];
    for (let i = 0; i < targetCount; i++) {
      particles.push(spawnParticle(width, height, false));
    }

    let rafId = 0;
    let lastTs = performance.now();
    let running = true;
    let paused = false;

    const frame = (ts: number): void => {
      if (!running) return;
      if (paused) {
        lastTs = ts;
        rafId = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;

      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const alive = stepParticle(p, dt, width, height);
        if (!alive) {
          particles[i] = spawnParticle(width, height, true);
          continue;
        }
        const lifeFrac = p.life / p.maxLife;
        let alpha = 0.85;
        if (lifeFrac > 0.82) alpha = ((1 - lifeFrac) / 0.18) * 0.85;
        else if (lifeFrac < 0.2) alpha = (lifeFrac / 0.2) * 0.85;

        if (p.kind === 'star') drawStar(ctx, p, alpha);
        else if (p.kind === 'confetti') drawConfetti(ctx, p, alpha);
        else drawSpeck(ctx, p, alpha);
      }
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    const onVisibility = (): void => {
      paused = document.visibilityState === 'hidden';
      if (!paused) {
        lastTs = performance.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isMobile]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="disco-sparkle-canvas"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 1,
        // `mix-blend-mode: screen` forces a full-viewport composite pass every
        // frame. Desktop GPUs breeze through this; on mobile it was one of the
        // worst offenders. Particles already use per-pixel alpha via
        // `globalAlpha` in the draw routines, so plain compositing still reads
        // as "sparkles on top of the disco scene" — just additive-light rather
        // than pure screen-blend.
        mixBlendMode: isMobile ? 'normal' : 'screen',
      }}
    />
  );
}
