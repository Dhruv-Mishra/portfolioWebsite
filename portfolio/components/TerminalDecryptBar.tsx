"use client";

/**
 * TerminalDecryptBar — a terminal-style progress bar that animates from 0 →
 * 100% over ~1400ms (compressed to ~250ms under prefers-reduced-motion),
 * then swaps itself out for the supplied `reveal` React node.
 *
 * USAGE
 *   Rendered inline by `sudo cat adminTerminal.txt` after the user submits
 *   a password (correct OR incorrect). The visible chrome is:
 *
 *     decrypting adminTerminal.txt
 *     [████████████░░░░░░░░░░░░░░░░░░] 38%
 *
 *   The track is a monospaced 30-cell field of full-block ( █ ) and
 *   light-shade ( ░ ) glyphs. When progress reaches 100%, this component
 *   unmounts the bar and renders `reveal` in its place.
 *
 * DESIGN CHOICES
 *   - Uses `requestAnimationFrame` so the animation runs at the browser's
 *     native paint cadence (no `setInterval` drift, no layout thrash).
 *     The frame callback computes progress from `performance.now()` so
 *     duration is wall-clock accurate regardless of frame rate.
 *   - Respects `prefers-reduced-motion` by compressing the duration to
 *     ~250ms — the bar still appears (the illusion is load-bearing for
 *     the puzzle) but it's effectively instant for motion-sensitive users.
 *   - Width is driven entirely by monospaced characters + percent digits,
 *     so a 360px mobile viewport fits the whole thing with room to spare.
 *     `overflow-wrap: anywhere` on the container handles edge cases on
 *     very narrow screens (iOS rotated, etc.).
 *   - aria-live="polite" on the container so screen readers announce the
 *     transition to the final reveal without interrupting other speech.
 *
 * PERFORMANCE
 *   - Zero layout work per tick: only the inner span's textContent / the
 *     percent label's text change. `font-variant-numeric: tabular-nums`
 *     keeps the percent label from reflowing.
 *   - Cleans up the rAF on unmount.
 */

import React from 'react';

/** Total width of the bar in cells. 30 fits a 360px viewport at default font size. */
const BAR_CELLS = 30;
/** Full-block glyph for completed cells. */
const FILLED_CELL = '\u2588';
/** Light-shade glyph for pending cells. */
const EMPTY_CELL = '\u2591';
/** Default duration in ms — designer-tuned for "feels deliberate, not slow". */
const DEFAULT_DURATION_MS = 1400;
/** Compressed duration for prefers-reduced-motion. Still visible, near-instant. */
const REDUCED_MOTION_DURATION_MS = 250;

interface TerminalDecryptBarProps {
  /** Displayed above the bar. "decrypting adminTerminal.txt" by default. */
  label?: string;
  /** React node rendered AFTER the bar animation completes. */
  reveal: React.ReactNode;
  /** Duration override (ms). Respects prefers-reduced-motion below this value. */
  durationMs?: number;
}

/** Read prefers-reduced-motion once per mount. SSR-safe. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export default function TerminalDecryptBar({
  label = 'decrypting adminTerminal.txt',
  reveal,
  durationMs,
}: TerminalDecryptBarProps): React.ReactElement {
  const [done, setDone] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      // SSR: skip animation, go straight to reveal on the first client paint.
      setDone(true);
      return;
    }

    const reducedMotion = prefersReducedMotion();
    const duration = reducedMotion
      ? REDUCED_MOTION_DURATION_MS
      : durationMs ?? DEFAULT_DURATION_MS;

    const start = performance.now();
    let rafId = 0;
    let running = true;

    const tick = (now: number): void => {
      if (!running) return;
      const elapsed = now - start;
      const raw = Math.min(1, elapsed / duration);
      // Subtle ease-out so the last 10% doesn't feel abrupt. Linear would
      // also be fine; this just looks a touch more deliberate.
      const eased = 1 - Math.pow(1 - raw, 1.6);
      setProgress(eased);
      if (raw >= 1) {
        setDone(true);
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
    };
  }, [durationMs]);

  if (done) return <>{reveal}</>;

  const filledCount = Math.max(0, Math.min(BAR_CELLS, Math.round(progress * BAR_CELLS)));
  const track = FILLED_CELL.repeat(filledCount) + EMPTY_CELL.repeat(BAR_CELLS - filledCount);
  const percent = Math.round(progress * 100);

  return (
    <div
      className="terminal-decrypt-bar"
      role="status"
      aria-live="polite"
      aria-label={`${label} ${percent} percent complete`}
    >
      <p className="terminal-decrypt-bar__label">{label}</p>
      <p>
        <span aria-hidden="true">[</span>
        <span className="terminal-decrypt-bar__track" aria-hidden="true">
          {track}
        </span>
        <span aria-hidden="true">]</span>
        <span className="terminal-decrypt-bar__percent" aria-hidden="true">
          {percent}%
        </span>
      </p>
    </div>
  );
}
