"use client";

/**
 * DiscoMatrixOverlay — matrix-rain overlay spawned by `sudo matrix`.
 *
 * Isolated into its own module so the Matrix rain code is NOT in the eager
 * disco bundle. Loaded on demand via dynamic import() when the sudo:matrix
 * CustomEvent fires.
 *
 * This file exports a single function `spawnMatrixOverlay()` — purely
 * imperative canvas side effect; no React component is rendered.
 */

const MATRIX_DURATION_MS = 8000;

export function spawnMatrixOverlay(): void {
  if (typeof document === 'undefined') return;
  // Guard against stacking multiple overlays.
  const existing = document.getElementById('sudo-matrix-overlay');
  if (existing) existing.remove();

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.id = 'sudo-matrix-overlay';
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.zIndex = '9998'; // just under cursor layer
  canvas.style.pointerEvents = 'none';
  canvas.style.background = 'rgba(0, 0, 0, 0.78)';
  canvas.style.transition = 'opacity 500ms ease-out';
  canvas.style.opacity = '0';
  document.body.appendChild(canvas);

  // Fade in.
  requestAnimationFrame(() => {
    canvas.style.opacity = '1';
  });

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    // Canvas context unavailable — graceful fallback: just fade out.
    setTimeout(() => {
      canvas.style.opacity = '0';
      setTimeout(() => canvas.remove(), 500);
    }, 2000);
    return;
  }

  let rafId = 0;
  let running = true;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const charColumns = 18; // character grid — keep tight on perf
  const glyphs = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロ01Dhruv';

  const resize = (): void => {
    const { innerWidth, innerHeight } = window;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  const fontSize = Math.max(14, Math.floor(window.innerWidth / charColumns / 1.2));
  const columns = Math.floor(window.innerWidth / fontSize);
  const drops = new Array(columns).fill(1);

  const stepFrame = (): void => {
    if (!running) return;
    // Backdrop fade — creates the trailing-glyph effect.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    ctx.fillStyle = '#10b981'; // emerald
    ctx.font = `${fontSize}px "Fira Code", monospace`;
    for (let i = 0; i < drops.length; i++) {
      const text = glyphs.charAt(Math.floor(Math.random() * glyphs.length));
      ctx.fillText(text, i * fontSize, drops[i] * fontSize);
      if (drops[i] * fontSize > window.innerHeight && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }
    rafId = requestAnimationFrame(stepFrame);
  };

  // Reduced-motion: render a single static snapshot and leave it up shorter.
  if (prefersReducedMotion) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.fillStyle = '#10b981';
    ctx.font = `${fontSize}px "Fira Code", monospace`;
    for (let col = 0; col < columns; col++) {
      for (let row = 0; row < 10; row++) {
        const text = glyphs.charAt(Math.floor(Math.random() * glyphs.length));
        ctx.fillText(text, col * fontSize, (row + 1) * fontSize);
      }
    }
  } else {
    rafId = requestAnimationFrame(stepFrame);
  }

  const teardown = (): void => {
    running = false;
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resize);
    canvas.style.opacity = '0';
    setTimeout(() => {
      canvas.remove();
    }, 500);
  };

  // Time-box: auto-tear-down. User can also click to dismiss early.
  const timeout = setTimeout(teardown, MATRIX_DURATION_MS);
  canvas.style.pointerEvents = 'auto';
  canvas.addEventListener(
    'click',
    () => {
      clearTimeout(timeout);
      teardown();
    },
    { once: true },
  );
  // Also bail on first keypress.
  const keyHandler = (): void => {
    clearTimeout(timeout);
    teardown();
    window.removeEventListener('keydown', keyHandler);
  };
  window.addEventListener('keydown', keyHandler, { once: true });
}
