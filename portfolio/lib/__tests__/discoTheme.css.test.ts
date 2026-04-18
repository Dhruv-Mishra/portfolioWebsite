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

  it('hero heading legibility: no `color: transparent` + `background-clip: text` pattern', () => {
    // Regression guard for the "disco hero text disappears" bug. The fragile
    // pattern of painting text transparent and relying on background-clip: text
    // can render invisibly when nested inline children (<strong>, <span>, <a>)
    // break the cascade OR when the box sits on the translucent disco paper
    // gradient. Ensure the disco heading rule doesn't reintroduce it.
    const headingBlock = CSS.match(
      /html\[data-disco="on"\]\s+h1,\s*\n?\s*html\[data-disco="on"\]\s+h2,\s*\n?\s*html\[data-disco="on"\]\s+h3\s*\{[\s\S]*?\}/,
    );
    expect(headingBlock).toBeTruthy();
    const block = headingBlock?.[0] ?? '';
    // The rule block itself must not set text-fill-color or color to transparent.
    expect(block).not.toMatch(/-webkit-text-fill-color\s*:\s*transparent/);
    expect(block).not.toMatch(/(?<!background-)color\s*:\s*transparent/);
    // And it must not apply background-clip: text.
    expect(block).not.toMatch(/background-clip\s*:\s*text/);
  });

  it('disco headings cycle an opaque color so nested inline content stays legible', () => {
    // The replacement rule uses an animated color cycle. Verify the animation
    // name is bound in the block and the keyframe is defined.
    expect(CSS).toMatch(/@keyframes\s+disco-heading-color/);
    const headingBlock = CSS.match(
      /html\[data-disco="on"\]\s+h1,\s*\n?\s*html\[data-disco="on"\]\s+h2,\s*\n?\s*html\[data-disco="on"\]\s+h3\s*\{[\s\S]*?\}/,
    );
    expect(headingBlock?.[0]).toMatch(/animation:\s*disco-heading-color/);
  });

  it('disco headings force nested strong/span/em to inherit the disco color', () => {
    // Without this rule, `<strong class="text-gray-900">` inside a disco h1
    // would paint gray over the vibrant disco color, defeating the effect and
    // can look like the heading is "broken" at certain frames. Guardrail.
    expect(CSS).toMatch(/html\[data-disco="on"\]\s+h1\s*>\s*:where\(strong, em, span, b, i\)/);
  });

  it('ships the mute button baseline class', () => {
    expect(CSS).toMatch(/\.disco-mute-btn/);
  });

  it('bumps muted-gray body text to a legible color under dark disco', () => {
    // Accessibility guardrail: `text-gray-400` on the dark-disco jewel-tone
    // gradient can drop below WCAG AA contrast on some stops. The CSS must
    // explicitly override those utility classes under dark disco to keep body
    // text readable.
    expect(CSS).toMatch(/html\[data-disco="on"\]\.dark\s+\.text-gray-400/);
  });

  it('rescues .animate-hero-subtitle opacity under disco (p/li animation cancel bug)', () => {
    // Regression guard for the "hero subtitle invisible in disco" bug. The
    // `.animate-hero-subtitle` utility rule has baseline `opacity: 0` +
    // `animation: heroSubtitleIn ... forwards`. The disco theme's broad
    // `html[data-disco="on"] p, li { animation: none !important }` rule
    // cancels the animation, which clears the `forwards` fill, reverting
    // opacity to 0 and making the text invisible.
    //
    // The fix is an explicit rescue rule that pins opacity back to 1 whenever
    // disco is on, regardless of element type (<p> or <a>).
    const rescueBlock = CSS.match(
      /html\[data-disco="on"\]\s+\.animate-hero-subtitle\s*\{[\s\S]*?\}/,
    );
    expect(rescueBlock).toBeTruthy();
    expect(rescueBlock?.[0]).toMatch(/opacity\s*:\s*1/);
  });

  it('disco floor sweep is desktop-only (skipped on mobile for perf)', () => {
    // The `body::after` floor sweep layers a 22vh `mix-blend-mode: screen`
    // pseudo-element that re-composites the entire viewport every frame. On
    // mobile this was a top paint-cost offender; the sweep is now wrapped in
    // a `(hover: hover) and (pointer: fine)` media query so touch devices
    // skip it entirely.
    expect(CSS).toMatch(
      /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{[\s\S]*?html\[data-disco="on"\]\s+body::after/,
    );
  });

  it('disco note-card hue animation is desktop-only (skipped on mobile for perf)', () => {
    // `filter: hue-rotate` animations force a per-frame repaint of the
    // element and its descendants. On /projects with 8 dancing note cards
    // this was the single biggest mobile FPS hit. The CSS now scopes the
    // card-hue animation to `(hover: hover) and (pointer: fine)`, so coarse-
    // pointer devices skip the cascade entirely. The keyframe itself must
    // remain defined (other rules may still reference it). Body gradient +
    // spotlights still provide color variety on mobile.
    expect(CSS).toMatch(
      /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{[\s\S]*?\.bg-note-paper[\s\S]*?animation:\s*disco-card-hue/,
    );
    // The keyframe is still defined (unchanged).
    expect(CSS).toMatch(/@keyframes\s+disco-card-hue\s*\{/);
  });
});
