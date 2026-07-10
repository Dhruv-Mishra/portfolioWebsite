import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const template = fs.readFileSync(path.join(projectRoot, 'app', 'template.tsx'), 'utf8');
const css = fs.readFileSync(path.join(projectRoot, 'app', 'globals.css'), 'utf8');
const packageJson = fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8');
const packageLock = fs.readFileSync(path.join(projectRoot, 'package-lock.json'), 'utf8');

describe('page-turn route transition contract', () => {
  it('keeps the route template on the server without a router or motion runtime', () => {
    expect(template).not.toMatch(/^\s*["']use client["'];?/m);
    expect(template).not.toMatch(/from ["'](?:next\/navigation|framer-motion|motion\/react)["']/);
    expect(template).not.toMatch(
      /\b(?:document|window|usePathname|useRouter|useTransition|startViewTransition|ViewTransition)\b/,
    );
    expect(template).not.toMatch(/\bon[A-Z][A-Za-z]+\s*=/);
  });

  it('keeps scrolling on the outer wrapper and animates a full-size inner surface', () => {
    const outerClass = template.match(/return \(\s*<div\s+className="([^"]+)"/)?.[1] ?? '';
    const innerClass = template.match(/<div\s+className="([^"]*animate-page-template-in[^"]*)"/)?.[1] ?? '';

    expect(outerClass).toBe(
      'h-full min-h-full min-w-0 max-w-full overflow-y-auto overflow-x-clip px-3 py-6 sm:px-5 sm:py-8 md:p-12 ruler-scrollbar',
    );
    expect(outerClass).not.toContain('animate-page-template-in');
    expect(innerClass).toContain('h-full');
    expect(innerClass).toContain('min-h-full');
    expect(innerClass).toContain('min-w-0');
    expect(template).toMatch(/animate-page-template-in[^>]*>\s*\{children\}\s*<\/div>/s);
  });

  it('progressively enhances a safe fade with compositor-only paper-turn geometry', () => {
    const pageTurnCss = css.match(
      /\.animate-page-template-in\s*\{[\s\S]+?(?=\/\* Cursor handling)/,
    )?.[0] ?? '';
    const turnKeyframes = pageTurnCss.match(
      /@keyframes pageTemplateTurnIn \{([\s\S]+?)(?=@keyframes pageTemplateShadeIn)/,
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
    expect(pageTurnCss).toContain('transform-origin: left center');
    expect(pageTurnCss).toContain(
      'transform: perspective(var(--page-turn-perspective)) rotateY(var(--page-turn-angle));',
    );
    expect(new Set(turnProperties)).toEqual(new Set(['opacity', 'transform']));
    expect(new Set(shadeProperties)).toEqual(new Set(['opacity']));
    expect(turnKeyframes).not.toMatch(
      /\b(?:width|height|margin|padding|top|right|bottom|left)\s*:/,
    );
    expect(pageTurnCss).not.toContain('will-change');
    expect(pageTurnCss).not.toMatch(/view-transition|startViewTransition/);
    expect(pageTurnCss).not.toMatch(/pageTemplateTurnIn[^;]+\bboth\b/);
  });

  it('uses an out-of-flow, non-interactive paper-and-ink shade', () => {
    const pseudo = css.match(
      /\.animate-page-template-in::after\s*\{([\s\S]+?)\}/,
    )?.[1] ?? '';

    expect(pseudo).toContain('position: absolute');
    expect(pseudo).toContain('inset: 0');
    expect(pseudo).toContain('pointer-events: none');
    expect(pseudo).toContain('var(--c-paper)');
    expect(pseudo).toContain('var(--c-ink)');
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
      /html\[data-motion="reduced"\] \.animate-page-template-in\s*\{[\s\S]*?animation:\s*none\s*!important/,
    );
  });

  it('adds no page-turn dependency', () => {
    expect(packageJson).not.toMatch(/(?:page-flip|page-turn|turn\.js)/i);
    expect(packageLock).not.toMatch(/(?:page-flip|page-turn|turn\.js)/i);
  });
});