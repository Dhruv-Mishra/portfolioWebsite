/**
 * Regression tests for Bug 1 — the `sudo disco` / `sudo matrix` confirmation
 * warning used to render three fixed-width `<pre>` lines with ASCII
 * box-drawing glyphs (╔═══…═══╗), ~51 characters wide. At a monospace
 * ~8–10 px/ch that's 408–510 px intrinsic width, which overflowed the
 * iPhone SE (375 px) + iPhone 12 Pro (390 px) viewports, triggered iOS
 * Safari auto-zoom, and forced horizontal scroll on the whole page.
 *
 * Fix: the box-drawing frame was replaced with CSS-drawn borders that flow
 * to the parent width. These tests lock in the new markup contract so a
 * future regression reintroducing the `<pre>` frame would fail loudly.
 *
 * We render via `react-dom/server.renderToStaticMarkup` so we don't need a
 * DOM (vitest runs in `environment: node`, per vitest.config.ts). The file
 * intentionally uses `React.createElement` calls instead of JSX so it can
 * live under the `.test.ts` glob that vitest.config.ts picks up — the
 * overall suite does not yet need a `.tsx` extension pattern.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type * as React from 'react';
import {
  dispatchSudo,
  parseSudoInvocation,
} from '@/lib/sudoCommands';

// Minimal cheatsheet renderer stub — dispatchSudo's context interface needs
// a renderCheatsheet function even when we aren't exercising the cheatsheet
// branch.
const ctx = {
  renderCheatsheet: (): React.ReactNode => null,
};

function renderWarning(sub: 'disco' | 'matrix'): string {
  const result = dispatchSudo(parseSudoInvocation([sub]), ctx);
  return renderToStaticMarkup(result.output as React.ReactElement);
}

describe('sudo confirm warning — responsive mobile markup', () => {
  it('disco warning does NOT render the wide ASCII box-drawing frame', () => {
    const markup = renderWarning('disco');
    // The heavy box-drawing chars are gone. `╔═══…═══╗` was the #1 offender.
    expect(markup).not.toMatch(/╔/);
    expect(markup).not.toMatch(/╗/);
    expect(markup).not.toMatch(/╚/);
    expect(markup).not.toMatch(/╝/);
    expect(markup).not.toMatch(/║/);
    // And the three hard-coded `<pre>` lines that housed them.
    const preCount = (markup.match(/<pre/g) || []).length;
    expect(preCount).toBe(0);
  });

  it('matrix warning does NOT render the wide ASCII box-drawing frame', () => {
    const markup = renderWarning('matrix');
    expect(markup).not.toMatch(/╔|╗|╚|╝|║/);
    const preCount = (markup.match(/<pre/g) || []).length;
    expect(preCount).toBe(0);
  });

  it('warning still contains the user-visible "WARNING" label', () => {
    // The replacement rule uses CSS borders with a centered WARNING label.
    // Preserve the visible copy — the rest of the styling is in CSS classes.
    const markupDisco = renderWarning('disco');
    const markupMatrix = renderWarning('matrix');
    expect(markupDisco).toMatch(/WARNING/);
    expect(markupMatrix).toMatch(/WARNING/);
  });

  it('warning still advertises the confirm command and cancel command', () => {
    const markupDisco = renderWarning('disco');
    expect(markupDisco).toMatch(/sudo disco yes/);
    expect(markupDisco).toMatch(/sudo disco no/);
    const markupMatrix = renderWarning('matrix');
    expect(markupMatrix).toMatch(/sudo matrix yes/);
    expect(markupMatrix).toMatch(/sudo matrix no/);
  });

  it('warning uses `break-words` + `max-w-full` so children can wrap at any viewport', () => {
    // Sanity: at least one Tailwind wrapping class is applied so long tokens
    // (eg a future command name) cannot force the container wider than the
    // terminal body.
    const markup = renderWarning('disco');
    expect(markup).toMatch(/break-words/);
    expect(markup).toMatch(/max-w-full/);
  });

  it('warning renders an accessible `role="alert"` for the warning bar', () => {
    // The replacement box is a bordered <div role="alert"> so SRs still
    // announce it as an alert region even without the ASCII frame.
    const markup = renderWarning('disco');
    expect(markup).toMatch(/role="alert"/);
  });

  it('action is still undefined for bare `sudo disco` / `sudo matrix` (confirm flow preserved)', () => {
    const disco = dispatchSudo(parseSudoInvocation(['disco']), ctx);
    const matrix = dispatchSudo(parseSudoInvocation(['matrix']), ctx);
    expect(disco.action).toBeUndefined();
    expect(matrix.action).toBeUndefined();
  });

  it('action IS defined after explicit `yes` (regression guard)', () => {
    // Bug 1 fix must not accidentally break the two-step confirm flow.
    const disco = dispatchSudo(parseSudoInvocation(['disco', 'yes']), ctx);
    const matrix = dispatchSudo(parseSudoInvocation(['matrix', 'yes']), ctx);
    expect(typeof disco.action).toBe('function');
    expect(typeof matrix.action).toBe('function');
    // Calling the action must not throw even though we're in a node env.
    // (The action guards on `typeof window === 'undefined'`.)
    expect(() => disco.action?.()).not.toThrow();
    expect(() => matrix.action?.()).not.toThrow();
  });
});

describe('sudo confirm warning — width bound', () => {
  it('markup contains no hard-coded text longer than 64 chars per line', () => {
    // Soft guard: the longest single text node should fit comfortably inside
    // a 390px-wide mobile viewport (~48ch at the terminal's `text-sm` /
    // `font-code` sizing). We check that no raw text node in the warning
    // is longer than 64 chars — which gives the CSS box plenty of headroom.
    // The old ASCII frame produced ~51-char lines; we're replacing them with
    // natural-language lines that CAN wrap.
    const markup = renderWarning('disco');
    // Strip HTML tags; collect text nodes.
    const text = markup.replace(/<[^>]+>/g, '\n');
    const lines = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    for (const line of lines) {
      expect(line.length, `line too long: ${line}`).toBeLessThanOrEqual(64);
    }
  });
});
