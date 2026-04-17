/**
 * Guardrail test for the disco-theme CSS injected into app/globals.css.
 *
 * The disco theme is activated via a `[data-disco="on"]` attribute on <html>.
 * These tests verify that:
 *   1. The trigger selector is present.
 *   2. The reduced-motion media query is present (required for a11y).
 *   3. Light and dark token definitions (`--c-paper` under `:root` and `.dark`)
 *      still exist — disco must not clobber them. This is our snapshot-style
 *      check: if the light/dark base vars disappear, the build silently breaks.
 *   4. The `@keyframes disco-paper` cycle is defined.
 *   5. The sticker-card superuser class exists.
 *   6. The note-paper single-token replacement is present.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CSS_PATH = path.resolve(__dirname, '../../app/globals.css');
const CSS = fs.readFileSync(CSS_PATH, 'utf8');

describe('globals.css disco theme', () => {
  it('defines the [data-disco="on"] selector', () => {
    expect(CSS).toMatch(/\[data-disco="on"\]/);
  });

  it('defines the @keyframes disco-paper cycle', () => {
    expect(CSS).toMatch(/@keyframes\s+disco-paper/);
  });

  it('honors prefers-reduced-motion', () => {
    expect(CSS).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it('light-mode :root still sets --c-paper', () => {
    // The initial :root declaration must not be wiped by disco rules.
    const rootBlock = CSS.match(/:root\s*\{[\s\S]*?\}/);
    expect(rootBlock).toBeTruthy();
    expect(rootBlock?.[0]).toMatch(/--c-paper/);
  });

  it('.dark block still sets --c-paper', () => {
    const darkBlock = CSS.match(/\.dark\s*\{[\s\S]*?\}/);
    expect(darkBlock).toBeTruthy();
    expect(darkBlock?.[0]).toMatch(/--c-paper/);
  });

  it('defines the superuser sticker-card class', () => {
    expect(CSS).toMatch(/\.sticker-card--superuser/);
  });

  it('defines the single --note-paper token', () => {
    expect(CSS).toMatch(/--note-paper\s*:/);
  });

  it('leaves a single .bg-note-paper utility class', () => {
    // The compressed alias group should be reachable by the root selector.
    expect(CSS).toMatch(/\.bg-note-paper/);
  });

  it('defines the rainbow-underline cycle keyframe (regression guard)', () => {
    expect(CSS).toMatch(/@keyframes\s+sudo-rainbow-cycle/);
  });

  it('defines the disco spotlight drift keyframes', () => {
    expect(CSS).toMatch(/@keyframes\s+disco-spot-magenta/);
    expect(CSS).toMatch(/@keyframes\s+disco-spot-cyan/);
    expect(CSS).toMatch(/@keyframes\s+disco-spot-gold/);
  });

  it('defines the three extra spotlight keyframes (violet/lime/coral)', () => {
    // Added in the upgrade — bring total spotlights to 6 with distinct path shapes.
    expect(CSS).toMatch(/@keyframes\s+disco-spot-violet/);
    expect(CSS).toMatch(/@keyframes\s+disco-spot-lime/);
    expect(CSS).toMatch(/@keyframes\s+disco-spot-coral/);
  });

  it('defines all four motion-vocabulary keyframes (bounce-soft/wiggle/shimmy/breath)', () => {
    // Motion vocabulary: 4 named variants with distinct feels. bounce-soft already existed.
    expect(CSS).toMatch(/@keyframes\s+disco-bounce-soft/);
    expect(CSS).toMatch(/@keyframes\s+disco-wiggle/);
    expect(CSS).toMatch(/@keyframes\s+disco-shimmy/);
    expect(CSS).toMatch(/@keyframes\s+disco-breath/);
  });

  it('binding spine goes transparent in disco so the body gradient bleeds through', () => {
    // Fix for the "dead band at left edge" bug. During disco, the flat binding
    // fill color gets overridden with `background-color: transparent`.
    const bindingBlock = CSS.match(
      /html\[data-disco="on"\]\s+\.bg-binding-bg\s*\{[\s\S]*?\}/,
    );
    expect(bindingBlock).toBeTruthy();
    expect(bindingBlock?.[0]).toMatch(/background-color\s*:\s*transparent/);
  });

  it('motion variants are selectable by data-disco-motion attribute', () => {
    // We expose a site-wide selector `[data-disco-motion="wiggle|shimmy|breath"]`
    // so opting a component into a motion variant is a single attribute change.
    expect(CSS).toMatch(/\[data-disco-motion="wiggle"\]/);
    expect(CSS).toMatch(/\[data-disco-motion="shimmy"\]/);
    expect(CSS).toMatch(/\[data-disco-motion="breath"\]/);
  });

  it('defines anti-pattern overrides — main / focused inputs never dance', () => {
    // Explicit anti-pattern rules — must be present so readability is preserved.
    expect(CSS).toMatch(/html\[data-disco="on"\]\s+main[\s\S]*?animation:\s*none/);
    expect(CSS).toMatch(/input:focus[\s\S]*?animation:\s*none/);
  });

  it('defines the disco floor sweep keyframe', () => {
    expect(CSS).toMatch(/@keyframes\s+disco-floor-sweep/);
  });

  it('defines the disco beat-bounce keyframe for chrome elements', () => {
    expect(CSS).toMatch(/@keyframes\s+disco-bounce-soft/);
  });

  it('applies heading shimmer inside disco mode', () => {
    expect(CSS).toMatch(/@keyframes\s+disco-heading-shimmer/);
  });

  it('ships the mute button baseline class', () => {
    expect(CSS).toMatch(/\.disco-mute-btn/);
  });
});
