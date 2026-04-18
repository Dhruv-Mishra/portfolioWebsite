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
  it('canvas CSS style uses dynamic viewport units (100dvw / 100dvh)', () => {
    // Without dvw/dvh, iOS Safari leaves a strip of uncovered content at the
    // bottom of the viewport while the URL bar is visible.
    expect(OVERLAY_SRC).toMatch(/width:\s*['"]100dvw['"]/);
    expect(OVERLAY_SRC).toMatch(/height:\s*['"]100dvh['"]/);
  });

  it('canvas CSS does NOT use the legacy 100vw / 100vh fixed-viewport units', () => {
    // If these ever come back the mobile regression returns.
    // Allow the substring inside comments but not as a JS property value.
    const styleBlocks = OVERLAY_SRC.match(/style=\{\{[\s\S]*?\}\}/g) || [];
    for (const block of styleBlocks) {
      expect(block, `legacy 100vh in style block: ${block}`).not.toMatch(/['"]100vh['"]/);
      expect(block, `legacy 100vw in style block: ${block}`).not.toMatch(/['"]100vw['"]/);
    }
  });

  it('reads visualViewport when available', () => {
    // The new `readViewportSize()` helper prefers visualViewport over
    // window.innerWidth/innerHeight on iOS Safari.
    expect(OVERLAY_SRC).toMatch(/window\.visualViewport/);
    expect(OVERLAY_SRC).toMatch(/readViewportSize/);
  });

  it('listens for visualViewport resize + scroll events', () => {
    // iOS Safari fires these events when the URL bar collapses / re-expands.
    // Without them the canvas would leave a gap until a layout-viewport
    // resize finally fired (which may never happen during a single gesture).
    expect(OVERLAY_SRC).toMatch(/vv\.addEventListener\(['"]resize['"]/);
    expect(OVERLAY_SRC).toMatch(/vv\.addEventListener\(['"]scroll['"]/);
  });

  it('cleans up visualViewport listeners on unmount (no leak)', () => {
    expect(OVERLAY_SRC).toMatch(/vv\.removeEventListener\(['"]resize['"]/);
    expect(OVERLAY_SRC).toMatch(/vv\.removeEventListener\(['"]scroll['"]/);
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
