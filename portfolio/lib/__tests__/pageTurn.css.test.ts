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
const packageJson = fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8');
const packageLock = fs.readFileSync(path.join(projectRoot, 'package-lock.json'), 'utf8');

describe('page-turn route transition contract', () => {
  it('keeps scroll ownership in the server template without a motion runtime', () => {
    expect(template).not.toMatch(/^\s*["']use client["'];?/m);
    expect(template).not.toMatch(/from ["'](?:framer-motion|motion\/react)["']/);
    expect(template).not.toMatch(/\b(?:document|window|startViewTransition|ViewTransition)\b/);
    expect(template).not.toMatch(/\bon[A-Z][A-Za-z]+\s*=/);
  });

  it('keys a full-size surface to pathname and subscribes to navigation intent', () => {
    const outerClass = template.match(/return \(\s*<div\s+className="([^"]+)"/)?.[1] ?? '';
    const contentClass = surface.match(/<div\s+className="([^"]*relative z-10[^"]*)">\s*\{children\}/s)?.[1] ?? '';

    expect(outerClass).toBe(
      'h-full min-h-full min-w-0 max-w-full overflow-y-auto overflow-x-clip px-3 py-6 sm:px-5 sm:py-8 md:p-12 ruler-scrollbar',
    );
    expect(outerClass).not.toContain('animate-page-template-in');
    expect(template).toContain('<PageTurnSurface>{children}</PageTurnSurface>');
    expect(surface).toContain('"use client"');
    expect(surface).toContain("import { usePathname } from 'next/navigation'");
    expect(surface).toContain('const pathname = usePathname()');
    expect(surface).toContain('useSyncExternalStore(');
    expect(surface).toContain('installPageTurnHistory()');
    expect(surface).toContain("activeTransition && 'animate-page-template-in'");
    expect(surface).toContain('transition?.toPath === pathname');
    expect(surface).toContain('data-page-turn-direction={activeTransition?.direction}');
    expect(surface).toContain('data-page-turn-distance={activeTransition?.distance}');
    expect(surface).toContain('key={pathname}');
    expect(surface).not.toMatch(/framer-motion|startViewTransition|onClick/);
    expect(surface).toContain("'page-turn-surface h-full min-h-full min-w-0 isolate'");
    expect(contentClass).toContain('h-full');
    expect(contentClass).toContain('min-h-full');
    expect(contentClass).toContain('min-w-0');
  });

  it('progressively enhances a safe fade with compositor-only paper-turn geometry', () => {
    const pageTurnCss = css.match(
      /\.animate-page-template-in\s*\{[\s\S]+?(?=\/\* Cursor handling)/,
    )?.[0] ?? '';
    const turnKeyframes = pageTurnCss.match(
      /@keyframes pageTemplateTurnIn \{([\s\S]+?)(?=@keyframes pageTemplateShadeIn)/,
    )?.[1] ?? '';
    const secondaryKeyframes = pageTurnCss.match(
      /@keyframes pageTemplateSecondaryIn \{([\s\S]+?)(?=@keyframes pageTemplateShadeIn)/,
    )?.[1] ?? '';
    const shadeKeyframes = pageTurnCss.match(
      /@keyframes pageTemplateShadeIn\s*\{([\s\S]*?)^    \}/m,
    )?.[1] ?? '';
    const turnProperties = Array.from(
      turnKeyframes.matchAll(/^\s*([\w-]+)\s*:/gm),
      (match) => match[1],
    );
    const shadeProperties = Array.from(
      shadeKeyframes.matchAll(/\b([\w-]+)\s*:/g),
      (match) => match[1],
    );

    expect(pageTurnCss).toMatch(/animation:\s*pageTemplateFadeIn\s+\d+ms/);
    expect(pageTurnCss).toMatch(
      /@supports\s*\(transform:\s*perspective\(1px\) rotateY\(1deg\)\)/,
    );
    expect(pageTurnCss).toContain('--page-turn-origin: left center');
    expect(pageTurnCss).toContain('--page-turn-origin: right center');
    expect(pageTurnCss).toContain('--page-turn-angle: -38deg');
    expect(pageTurnCss).toContain('--page-turn-angle: -58deg');
    expect(pageTurnCss).toContain('--page-turn-angle: 58deg');
    expect(pageTurnCss).toContain('[data-page-turn-distance="2"]::before');
    expect(pageTurnCss).toContain('[data-page-turn-distance="3"]::before');
    expect(turnKeyframes).toContain('rotateY(var(--page-turn-angle))');
    expect(secondaryKeyframes).toContain('rotateY(var(--page-turn-secondary-angle))');
    expect(new Set(turnProperties)).toEqual(new Set(['opacity', 'transform']));
    expect(new Set(shadeProperties)).toEqual(new Set(['opacity']));
    expect(turnKeyframes).not.toMatch(
      /\b(?:width|height|margin|padding|top|right|bottom|left)\s*:/,
    );
    expect(pageTurnCss).toContain('will-change: transform, opacity');
    expect(pageTurnCss).toContain('will-change: auto');
    expect(pageTurnCss).not.toMatch(/view-transition|startViewTransition/);
    expect(pageTurnCss).not.toMatch(/pageTemplateTurnIn[^;]+\bboth\b/);
  });

  it('uses an out-of-flow, non-interactive paper-and-ink shade', () => {
    const pseudo = css.match(
      /\.animate-page-template-in::after\s*\{([\s\S]+?)\}/,
    )?.[1] ?? '';

    expect(pseudo).toContain('position: absolute');
    expect(pseudo).toContain('inset: 0');
    expect(pseudo).toContain('z-index: 20');
    expect(pseudo).toContain('pointer-events: none');
    expect(pseudo).toContain('var(--c-paper)');
    expect(pseudo).toContain('var(--c-ink)');
    expect(surface).toContain("activeTransition && 'animate-page-template-in'");
    expect(surface).toMatch(/relative z-10[^>]*>\s*\{children\}/s);
  });

  it('disables the turn and shade for system and explicit reduced motion', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.animate-page-template-in\s*\{[\s\S]*?animation:\s*none\s*!important/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.animate-page-template-in::after\s*\{[\s\S]*?content:\s*none/,
    );
    expect(css).toMatch(
      /html\[data-motion="reduced"\] \.animate-page-template-in::after\s*\{[\s\S]*?content:\s*none/,
    );
    expect(css).toMatch(
      /html\[data-motion="reduced"\] \.animate-page-template-in\s*\{[\s\S]*?pointer-events:\s*auto/,
    );
    expect(css).toMatch(
      /html\[data-motion="reduced"\] \.animate-page-template-in\s*\{[\s\S]*?animation:\s*none\s*!important/,
    );
  });

  it('adds no page-turn dependency', () => {
    expect(packageJson).not.toMatch(/(?:page-flip|page-turn|turn\.js)/i);
    expect(packageLock).not.toMatch(/(?:page-flip|page-turn|turn\.js)/i);
  });
});