import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const template = fs.readFileSync(path.join(projectRoot, 'app', 'template.tsx'), 'utf8');
const surface = fs.readFileSync(
  path.join(projectRoot, 'components', 'PageTurnSurface.tsx'),
  'utf8',
);
const css = fs.readFileSync(path.join(projectRoot, 'app', 'globals.css'), 'utf8');
const model = fs.readFileSync(path.join(projectRoot, 'lib', 'pageTurn.ts'), 'utf8');
const packageJson = fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8');
const packageLock = fs.readFileSync(path.join(projectRoot, 'package-lock.json'), 'utf8');
const layout = fs.readFileSync(path.join(projectRoot, 'app', 'layout.tsx'), 'utf8');

describe('page-turn route transition contract', () => {
  it('keeps the per-navigation server template transparent', () => {
    expect(template).not.toMatch(/^\s*["']use client["'];?/m);
    expect(template).not.toMatch(/from ["'](?:framer-motion|motion\/react)["']/);
    expect(template).not.toMatch(/\b(?:document|window|startViewTransition|ViewTransition)\b/);
    expect(template).not.toMatch(/\bon[A-Z][A-Za-z]+\s*=/);
    expect(template).toContain('return children;');
  });

  it('hosts one keyed real route layer in the persistent layout', () => {
    expect(layout).toContain('<PageTurnSurface>{children}</PageTurnSurface>');
    expect(surface).toContain('"use client"');
    expect(surface).toContain("import { usePathname, useRouter } from 'next/navigation'");
    expect(surface).toContain('const pathname = usePathname()');
    expect(surface).toContain('useSyncExternalStore(');
    expect(surface).toContain('uninstallHistory = installPageTurnHistory()');
    expect(surface).toMatch(/window\.setTimeout\([\s\S]*?installPageTurnHistory\(\)[\s\S]*?,\s*0\s*\)/);
    expect(surface).toContain('renderedPathname !== pathname');
    expect(surface).toContain('?? createPageTurnTransition(renderedPathname, pathname)');
    expect(surface).toContain('key={pathname}');
    expect(surface.match(/data-route-scroll-container/g)).toHaveLength(1);
    expect(surface.match(/data-page-turn-layer=/g)).toHaveLength(1);
    expect(surface).toContain('data-page-turn-layer="active"');
    expect(surface).toMatch(/\binert\b/);
    expect(surface).toContain('document.addEventListener(\'click\', onDocumentClick, true)');
    expect(surface).toContain('event.preventDefault()');
    expect(surface).toContain('router[pendingForward.mode](pendingForward.href)');
    expect(surface).toContain('const timeout = window.setTimeout(commitForwardNavigation, durationMs)');
    expect(surface).toContain('data-page-turn-direction={activeTransition?.direction}');
    expect(surface).toContain('data-page-turn-distance={activeTransition?.distance}');
    expect(surface).toContain("getPageTurnDurationMs(activeTransition.distance)");
    expect(surface).toContain("'--page-turn-duration': `${durationMs}ms`");
    expect(surface).toContain('window.setTimeout(');
    expect(surface).toContain('durationMs,');
    expect(surface).not.toMatch(/framer-motion|startViewTransition|cloneNode/);
    expect(surface).toContain('page-turn-stage relative h-full min-h-0 min-w-0 overflow-hidden isolate');
  });

  it('uses one aligned slow timing model for CSS and state cleanup', () => {
    expect(model).toContain('1: 680');
    expect(model).toContain('2: 760');
    expect(model).toContain('3: 840');
    expect(css).toContain('--page-turn-duration: 680ms');
    expect(css).not.toMatch(/--page-turn-duration:\s*(?:420|470|500|510|540|580)ms/);
    expect(surface).not.toMatch(/setTimeout\([\s\S]*?,\s*800\s*,?\s*\)/);
  });

  it('progressively enhances a safe fade with distinct left-hinged directions', () => {
    const pageTurnCss = css.match(
      /\/\* The persistent layout keeps[\s\S]+?(?=\/\* Cursor handling)/,
    )?.[0] ?? '';
    const forwardKeyframes = pageTurnCss.match(
      /@keyframes pageTurnForwardOut \{([\s\S]+?)(?=@keyframes pageTurnBackwardIn)/,
    )?.[1] ?? '';
    const backwardKeyframes = pageTurnCss.match(
      /@keyframes pageTurnBackwardIn \{([\s\S]+?)(?=@keyframes pageTurnForwardShadeOut)/,
    )?.[1] ?? '';
    const shadeKeyframes = pageTurnCss.match(
      /@keyframes pageTurnBackwardShadeIn\s*\{([\s\S]*?)^    \}/m,
    )?.[1] ?? '';
    const forwardProperties = Array.from(
      forwardKeyframes.matchAll(/^\s*([\w-]+)\s*:/gm),
      (match) => match[1],
    );
    const backwardProperties = Array.from(
      backwardKeyframes.matchAll(/^\s*([\w-]+)\s*:/gm),
      (match) => match[1],
    );
    const shadeProperties = Array.from(
      shadeKeyframes.matchAll(/\b([\w-]+)\s*:/g),
      (match) => match[1],
    );

    expect(pageTurnCss).toMatch(/animation:\s*pageTurnForwardFadeOut\s+var\(--page-turn-duration\)/);
    expect(pageTurnCss).toMatch(/animation:\s*pageTurnBackwardFadeIn\s+var\(--page-turn-duration\)/);
    expect(pageTurnCss).toMatch(
      /@supports\s*\(transform:\s*perspective\(1px\) rotateY\(1deg\)\)/,
    );
    expect(pageTurnCss).toContain('--page-turn-origin: left center');
    expect(pageTurnCss).not.toContain('right center');
    expect(pageTurnCss).toContain('--page-turn-forward-angle: -68deg');
    expect(pageTurnCss).toContain('--page-turn-backward-angle: -58deg');
    expect(pageTurnCss).toContain('.page-turn-layer[data-page-turn-distance="2"]');
    expect(pageTurnCss).toContain('.page-turn-layer[data-page-turn-distance="3"]');
    expect(forwardKeyframes).toContain('rotateY(var(--page-turn-forward-angle))');
    expect(backwardKeyframes).toContain('rotateY(var(--page-turn-backward-angle))');
    expect(forwardKeyframes).not.toBe(backwardKeyframes);
    expect(new Set(forwardProperties)).toEqual(new Set(['opacity', 'transform']));
    expect(new Set(backwardProperties)).toEqual(new Set(['opacity', 'transform']));
    expect(new Set(shadeProperties)).toEqual(new Set(['opacity']));
    expect(`${forwardKeyframes}${backwardKeyframes}`).not.toMatch(
      /\b(?:width|height|margin|padding|top|right|bottom|left)\s*:/,
    );
    expect(pageTurnCss).toContain('will-change: transform, opacity');
    expect(pageTurnCss).toContain('will-change: auto');
    expect(pageTurnCss).not.toMatch(/view-transition|startViewTransition/);
    expect(pageTurnCss).not.toContain('right center');
  });

  it('sequences nested entry motion until the page turn releases', () => {
    expect(css).toMatch(
      /\.animate-page-turn-forward-out :where\(\.page-turn-content, \.page-turn-content \*\)[\s\S]*?animation-play-state:\s*paused\s*!important/,
    );
    expect(css).toMatch(
      /html\[data-motion="reduced"\][\s\S]*?\.animate-page-turn-forward-out[\s\S]*?animation-play-state:\s*running\s*!important/,
    );
  });

  it('turns the one real route tree with a transparent ink shade', () => {
    const pseudo = css.match(
      /\.animate-page-turn-forward-out::after,\s*\.animate-page-turn-backward-in::after\s*\{([\s\S]+?)\}/,
    )?.[1] ?? '';

    expect(pseudo).toContain('position: absolute');
    expect(pseudo).toContain('inset: 0');
    expect(pseudo).toContain('z-index: 20');
    expect(pseudo).toContain('pointer-events: none');
    expect(css).toMatch(
      /\.animate-page-turn-forward-out::after\s*\{[\s\S]*?transparent[\s\S]*?var\(--c-ink\)/,
    );
    expect(surface).toContain("activeIsOutgoing && 'animate-page-turn-forward-out'");
    expect(surface).toContain("activeIsIncoming && 'animate-page-turn-backward-in'");
    expect(surface).toContain('{children}');
    expect(surface).not.toContain('outgoingRoute');
  });

  it('disables the turn and shade for system and explicit reduced motion', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.animate-page-turn-forward-out[\s\S]*?animation:\s*none\s*!important/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.animate-page-turn-forward-out::after[\s\S]*?content:\s*none/,
    );
    expect(css).toMatch(
      /html\[data-motion="reduced"\][\s\S]*?\.animate-page-turn-forward-out::after[\s\S]*?content:\s*none/,
    );
    expect(css).toMatch(
      /html\[data-motion="reduced"\][\s\S]*?\.animate-page-turn-backward-in[\s\S]*?pointer-events:\s*auto/,
    );
    expect(css).toMatch(
      /html\[data-motion="reduced"\][\s\S]*?\.animate-page-turn-backward-in[\s\S]*?animation:\s*none\s*!important/,
    );
    expect(surface).toContain('if (!nextTransition || reducedMotion) {');
    expect(surface).toContain('if (!reducedMotion) return');
  });

  it('adds no page-turn dependency', () => {
    expect(packageJson).not.toMatch(/(?:page-flip|page-turn|turn\.js)/i);
    expect(packageLock).not.toMatch(/(?:page-flip|page-turn|turn\.js)/i);
  });
});