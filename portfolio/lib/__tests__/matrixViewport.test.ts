/**
 * Source-level guards for Bug 3 — the matrix overlay used to size its
 * canvas against `window.innerWidth/innerHeight`, which on iOS Safari
 * returns the LAYOUT viewport rather than the visible viewport. When the
 * URL bar was visible, the canvas fell ~15% short of the bottom edge of
 * the visible area, leaving the page showing through underneath.
 *
 * The fix wires the resize handler to `visualViewport` (when available)
 * and swaps the CSS units from `100vh` / `100vw` to `100dvh` / `100dvw`.
 *
 * Vitest runs in `environment: node` here, so we can't exercise the canvas
 * directly — but we CAN grep the source to assert that the new code is in
 * place and the old patterns are gone. If someone backslides (eg reverts
 * to `innerHeight` or `100vh`), these tests fail.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const OVERLAY_PATH = path.resolve(
  __dirname,
  '../../components/DiscoMatrixOverlay.tsx',
);
const SPARKLE_PATH = path.resolve(
  __dirname,
  '../../components/DiscoSparkleCanvas.tsx',
);
const OVERLAY_SRC = fs.readFileSync(OVERLAY_PATH, 'utf8');
const SPARKLE_SRC = fs.readFileSync(SPARKLE_PATH, 'utf8');

describe('DiscoMatrixOverlay — mobile viewport coverage', () => {
  it('canvas CSS style uses LARGEST-viewport units (100lvw / 100lvh)', () => {
    // `100lvh` / `100lvw` return the full LAYOUT viewport — they ignore the
    // iOS software keyboard AND the collapsible URL bar. This matters because
    // matrix activates via `sudo matrix yes`, which is typed into the terminal
    // input while the keyboard is open; `100dvh` would paint into the shrunken
    // above-keyboard slice only. `100lvh` paints full-screen from frame 0.
    expect(OVERLAY_SRC).toMatch(/width:\s*['"]100lvw['"]/);
    expect(OVERLAY_SRC).toMatch(/height:\s*['"]100lvh['"]/);
  });

  it('canvas CSS does NOT use the legacy 100vw / 100vh OR dynamic 100dvw / 100dvh units', () => {
    // 100vh has the URL-bar gap bug (pre-dynamic units).
    // 100dvh has the keyboard-open gap bug (visualViewport-shrink during matrix
    // activation). Both must stay out of the canvas style block.
    const styleBlocks = OVERLAY_SRC.match(/style=\{\{[\s\S]*?\}\}/g) || [];
    for (const block of styleBlocks) {
      expect(block, `legacy 100vh in style block: ${block}`).not.toMatch(/['"]100vh['"]/);
      expect(block, `legacy 100vw in style block: ${block}`).not.toMatch(/['"]100vw['"]/);
      expect(block, `keyboard-shrinking 100dvh in style block: ${block}`).not.toMatch(/['"]100dvh['"]/);
      expect(block, `keyboard-shrinking 100dvw in style block: ${block}`).not.toMatch(/['"]100dvw['"]/);
    }
  });

  it('reads LAYOUT viewport via documentElement.clientHeight', () => {
    // The layout viewport is the ICB rect — stable across keyboard open/close.
    // `visualViewport` still gets consulted for pinch-zoom tracking, but the
    // LAYOUT measurement is the authoritative height.
    expect(OVERLAY_SRC).toMatch(/document\.documentElement/);
    expect(OVERLAY_SRC).toMatch(/clientHeight/);
    expect(OVERLAY_SRC).toMatch(/readViewportSize/);
  });

  it('still listens for visualViewport resize + scroll events (pinch-zoom + URL-bar)', () => {
    // iOS Safari fires these events when the URL bar collapses / re-expands
    // and on pinch-zoom. We still re-measure on those events so the canvas
    // tracks zoom and toolbar changes; the reading itself prefers the layout
    // viewport so keyboard-open doesn't shrink us.
    expect(OVERLAY_SRC).toMatch(/vv\.addEventListener\(['"]resize['"]/);
    expect(OVERLAY_SRC).toMatch(/vv\.addEventListener\(['"]scroll['"]/);
  });

  it('cleans up visualViewport listeners on unmount (no leak)', () => {
    expect(OVERLAY_SRC).toMatch(/vv\.removeEventListener\(['"]resize['"]/);
    expect(OVERLAY_SRC).toMatch(/vv\.removeEventListener\(['"]scroll['"]/);
  });

  it('blurs the focused input on mount (dismisses iOS keyboard)', () => {
    // Users activate matrix by typing `sudo matrix yes` into the terminal —
    // the input is focused, the software keyboard is up, and the overlay
    // would otherwise have to wait for the user to manually dismiss the
    // keyboard before the canvas covers the whole screen. Blurring the
    // active element at mount time asks iOS to dismiss the keyboard
    // immediately.
    expect(OVERLAY_SRC).toMatch(/\.blur\(\)/);
    expect(OVERLAY_SRC).toMatch(/activeElement/);
  });
});

describe('DiscoSparkleCanvas — mobile viewport coverage', () => {
  it('canvas CSS style uses dynamic viewport units (100dvw / 100dvh)', () => {
    expect(SPARKLE_SRC).toMatch(/width:\s*['"]100dvw['"]/);
    expect(SPARKLE_SRC).toMatch(/height:\s*['"]100dvh['"]/);
  });

  it('canvas CSS does NOT use the legacy 100vw / 100vh fixed-viewport units', () => {
    const styleBlocks = SPARKLE_SRC.match(/style=\{\{[\s\S]*?\}\}/g) || [];
    for (const block of styleBlocks) {
      expect(block, `legacy 100vh in style block: ${block}`).not.toMatch(/['"]100vh['"]/);
      expect(block, `legacy 100vw in style block: ${block}`).not.toMatch(/['"]100vw['"]/);
    }
  });
});
