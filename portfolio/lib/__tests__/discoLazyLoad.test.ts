/**
 * Lazy-load boundary tests for the disco mode bundle split.
 *
 * The contract we're enforcing:
 *   1. `DiscoFlagController` is the eagerly-mounted entry point. It subscribes
 *      to `discoActive`, writes the `data-disco` attribute, and dynamically
 *      imports the heavy layer only when the flag becomes true. It MUST NOT
 *      statically import the sparkle canvas, spotlights, mute button, or
 *      audio engine.
 *   2. `DiscoMediaLayer` is the heavy tree. It can import anything.
 *   3. `DiscoMatrixOverlay` is isolated — only loaded when `sudo matrix`
 *      fires. It MUST NOT be imported statically from either of the above.
 *   4. `EagerEnhancements.tsx` only uses `DiscoFlagController` (the tiny one).
 *      It must NOT statically reference the heavy modules.
 *
 * These checks are regex-based on the source files — we're guarding against
 * regressions where someone accidentally writes `import X from './DiscoSparkleCanvas'`
 * at the top of DiscoFlagController and silently ships the chunk to every
 * user. The guard does NOT run a webpack/turbopack build, so it won't catch
 * transitive violations through third-party re-exports — but because we own
 * every module in this chain, a source-level guard is sufficient.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const COMPONENTS_DIR = path.resolve(__dirname, '../../components');

function readSrc(filename: string): string {
  return fs.readFileSync(path.join(COMPONENTS_DIR, filename), 'utf8');
}

/** Extract all static `import ... from '<path>'` specifiers from a TS file. */
function staticImportsOf(src: string): string[] {
  const out: string[] = [];
  // Match `import ... from '<spec>'` and `import '<spec>'`
  const re = /^\s*import\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"];?\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/** Extract every dynamic import('<spec>') specifier from a TS file. */
function dynamicImportsOf(src: string): string[] {
  const out: string[] = [];
  const re = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out.push(m[1]);
  }
  return out;
}

describe('disco lazy-load boundary', () => {
  it('DiscoFlagController does not statically import the heavy media tree', () => {
    const src = readSrc('DiscoFlagController.tsx');
    const statics = staticImportsOf(src);
    // The forbidden static imports — if any of these land in the flag
    // controller the eager bundle swells.
    const forbidden = [
      './DiscoMediaLayer',
      './DiscoSparkleCanvas',
      './DiscoSpotlights',
      './DiscoMuteButton',
      '@/lib/discoAudio',
      './DiscoMatrixOverlay',
    ];
    for (const spec of forbidden) {
      expect(statics).not.toContain(spec);
    }
  });

  it('DiscoFlagController dynamically imports DiscoMediaLayer and DiscoMatrixOverlay', () => {
    const src = readSrc('DiscoFlagController.tsx');
    const dyns = dynamicImportsOf(src);
    expect(dyns).toContain('./DiscoMediaLayer');
    expect(dyns).toContain('./DiscoMatrixOverlay');
  });

  it('EagerEnhancements only references the flag controller (no heavy modules)', () => {
    const src = readSrc('EagerEnhancements.tsx');
    // EagerEnhancements may reference DiscoFlagController or the re-exporting
    // DiscoModeController — both are equivalent from a bundle-split POV.
    const combined =
      staticImportsOf(src).join(' ') + ' ' + dynamicImportsOf(src).join(' ');
    const forbidden = [
      './DiscoSparkleCanvas',
      './DiscoSpotlights',
      './DiscoMuteButton',
      './DiscoMediaLayer',
      './DiscoMatrixOverlay',
      '@/lib/discoAudio',
      '@/components/DiscoSparkleCanvas',
      '@/components/DiscoSpotlights',
      '@/components/DiscoMuteButton',
      '@/components/DiscoMediaLayer',
      '@/components/DiscoMatrixOverlay',
    ];
    for (const spec of forbidden) {
      expect(combined).not.toContain(spec);
    }
    // Should reference the flag controller (directly OR via the re-export path).
    expect(combined).toMatch(/DiscoFlagController|DiscoModeController/);
  });

  it('DiscoMediaLayer itself dynamically imports its sub-modules', () => {
    // Double-lazy pattern — even within the heavy chunk, the sparkle canvas /
    // spotlights / mute button are each their own dynamic chunk. That way if
    // a future optimization wants to skip the sparkle canvas on mobile, it
    // can short-circuit the import entirely.
    const src = readSrc('DiscoMediaLayer.tsx');
    const dyns = dynamicImportsOf(src);
    expect(dyns).toContain('./DiscoSparkleCanvas');
    expect(dyns).toContain('./DiscoSpotlights');
    expect(dyns).toContain('./DiscoMuteButton');
  });

  it('DiscoModeController is a thin re-export of DiscoFlagController', () => {
    // The legacy import path must keep working, but MUST NOT bloat.
    const src = readSrc('DiscoModeController.tsx');
    // Re-export syntax — either `export { default } from ...` or `export *`.
    expect(src).toMatch(/export\s+\{\s*default\s*\}\s+from\s+['"]\.\/DiscoFlagController['"]/);
    // No static imports of the heavy modules.
    const statics = staticImportsOf(src);
    expect(statics.some((s) => s.includes('MediaLayer'))).toBe(false);
    expect(statics.some((s) => s.includes('SparkleCanvas'))).toBe(false);
  });

  it('sudo disco handler pre-warms the media chunk on the user-gesture tick', () => {
    // Without pre-warming, there's a visible lag between `sudo disco` and
    // first paint of spotlights while the chunk is fetched. The handler in
    // lib/sudoCommands.tsx fires the import() on the click tick.
    const sudoSrc = fs.readFileSync(
      path.resolve(__dirname, '../../lib/sudoCommands.tsx'),
      'utf8',
    );
    expect(sudoSrc).toMatch(/import\(\s*['"]@\/components\/DiscoMediaLayer['"]\s*\)/);
  });
});

describe('disco render-count hygiene — source guards', () => {
  it('DiscoSparkleCanvas is NOT wrapped in a store subscription', () => {
    // The sparkle canvas must NOT subscribe to sticker/disco store. That way
    // parent re-renders (and even internal effects on mute) cannot trigger a
    // new particle system. The only store hook it reads is useIsMobile, which
    // is a media-query hook (stable).
    const src = readSrc('DiscoSparkleCanvas.tsx');
    expect(src).not.toMatch(/useDiscoActive|useDiscoMuted|useStickers|useStickerUnlocked/);
  });

  it('DiscoSpotlights is a pure functional component with no store subscription', () => {
    const src = readSrc('DiscoSpotlights.tsx');
    expect(src).not.toMatch(/useDiscoActive|useDiscoMuted|useStickers|useStickerUnlocked|useSyncExternalStore/);
  });

  it('DiscoVisuals (the long-lived tree) is memoized and reads no store state', () => {
    // The visual subtree must be a memo() wrapper so parent re-renders stop
    // at this boundary. And it must not read store state — re-render stops here.
    const src = readSrc('DiscoMediaLayer.tsx');
    const visualsBlock = src.match(/DiscoVisuals\s*=\s*memo\(function\s+DiscoVisuals[\s\S]*?\}\);/);
    expect(visualsBlock).toBeTruthy();
    // The visuals block itself does not touch any sticker-store hook.
    expect(visualsBlock?.[0]).not.toMatch(/useDisco|useSticker/);
  });

  it('DiscoAudioBridge — the mute-reactive component — is zero-DOM (returns null)', () => {
    // Keeps the audio bridge's re-renders cheap: they don't trigger any
    // reconciler work below since the tree is empty.
    const src = readSrc('DiscoMediaLayer.tsx');
    // Grab a generous window around the bridge definition and verify the
    // function type signature ends in `: null` AND its body returns null.
    expect(src).toMatch(/function\s+DiscoAudioBridge\s*\(\s*\)\s*:\s*null/);
    expect(src).toMatch(/DiscoAudioBridge[\s\S]*?return\s+null;\s*\}\s*\)/);
  });

  it('DiscoFlagController uses the narrow useDiscoActive selector (not useStickers)', () => {
    // The broad useStickers hook returns a full state object and re-renders
    // on every store mutation (sticker unlocks, album-seen, visited-routes).
    // The flag controller must use the narrow boolean selector.
    const src = readSrc('DiscoFlagController.tsx');
    expect(src).toMatch(/useDiscoActive/);
    expect(src).not.toMatch(/useStickers\s*\(/);
  });

  it('DiscoMuteButton uses the narrow useDiscoMuted selector', () => {
    // Same argument — the mute button must only re-render on mute flips.
    const src = readSrc('DiscoMuteButton.tsx');
    expect(src).toMatch(/useDiscoMuted/);
    expect(src).not.toMatch(/useStickers\s*\(/);
  });

  it('DiscoSpotlights includes 6 spotlight variants', () => {
    // Deliverable 3 — six variants total, three new (violet / lime / coral).
    const src = readSrc('DiscoSpotlights.tsx');
    expect(src).toMatch(/'magenta'/);
    expect(src).toMatch(/'cyan'/);
    expect(src).toMatch(/'gold'/);
    expect(src).toMatch(/'violet'/);
    expect(src).toMatch(/'lime'/);
    expect(src).toMatch(/'coral'/);
  });
});
