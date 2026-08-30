import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const template = fs.readFileSync(path.join(projectRoot, 'app', 'template.tsx'), 'utf8');
const surface = fs.readFileSync(
  path.join(projectRoot, 'components', 'PageTurnSurface.tsx'),
  'utf8',
);
const skeleton = fs.readFileSync(
  path.join(projectRoot, 'components', 'PageTurnSkeleton.tsx'),
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

  it('hosts reserved chrome and one keyed real route layer in the persistent layout', () => {
    expect(layout).toContain('<PageTurnSurface>{children}</PageTurnSurface>');
    expect(surface).toContain('"use client"');
    expect(surface).toContain("import { usePathname, useRouter } from 'next/navigation'");
    expect(surface).toContain('const pathname = usePathname()');
    expect(surface).toContain('useSyncExternalStore(');
    expect(surface).toContain('window.addEventListener(PAGE_TURN_NAVIGATION_EVENT, onNavigationRequest)');
    expect(surface).toContain('event.preventDefault()');
    expect(surface).toContain('router[request.mode](href)');
    expect(surface).toContain('startPageTurn(nextTransition)');
    expect(surface).toContain('finishPageTurn(nextTransition.sequence)');
    expect(surface).toContain('key={pathname}');
    expect(surface.match(/data-route-scroll-container/g)).toHaveLength(1);
    expect(surface.match(/data-page-turn-layer=/g)).toHaveLength(1);
    expect(surface).toContain('data-page-turn-layer="active"');
    expect(surface).toContain('document.addEventListener(\'click\', onDocumentClick, true)');
    expect(surface).toContain('pt-[var(--c-page-header-h)]');
    expect(surface).toContain('pb-[var(--c-page-footer-h)]');
    expect(surface).not.toContain('page-chrome-header');
    expect(surface).not.toContain('page-chrome-footer');
    expect(surface).not.toContain('installPageTurnHistory');
    expect(surface).not.toContain('animate-page-turn-forward-out');
    expect(surface).not.toContain('animate-page-turn-backward-in');
    expect(surface).not.toMatch(/framer-motion|startViewTransition|cloneNode/);
    expect(surface).toContain('page-turn-stage relative h-full min-h-0 min-w-0 overflow-hidden isolate');
    expect(surface).toContain('{children}');
    expect(surface).toContain("import PageTurnSkeleton from '@/components/PageTurnSkeleton'");
    expect(surface).toContain('label={resolvePageTurnRoute(destinationPath).label}');
    expect(css).toContain('--c-page-header-h: calc(var(--c-nav-tab-pt) + var(--c-nav-tab-py) + 1.5rem)');
    expect(css).toContain('--c-page-footer-h: var(--c-mobile-dock-clearance)');
    expect(css).toContain('--c-page-header-h: calc(var(--c-nav-tab-pt-md) + var(--c-nav-tab-py-md) + 1.5rem)');
    expect(css).toContain('--c-page-footer-h: 5.5rem');
    expect(css).not.toContain('.page-chrome-header');
    expect(css).not.toContain('.page-chrome-footer');
    expect(css).not.toMatch(/view-transition|startViewTransition/);
  });

  it('uses one aligned slow timing model for CSS and state cleanup', () => {
    expect(model).toContain('PAGE_TURN_DURATION_MS = 600');
    expect(model).not.toContain('PAGE_TURN_DURATION_BY_DISTANCE_MS');
    expect(surface).not.toMatch(/setTimeout\([\s\S]*?,\s*800\s*,?\s*\)/);
  });

  it('disables placeholder shimmer for system and explicit reduced motion', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.page-route-shimmer[\s\S]*?animation:\s*none\s*!important/,
    );
    expect(css).toMatch(
      /html\[data-motion="reduced"\] \.page-route-shimmer[\s\S]*?animation:\s*none\s*!important/,
    );
    expect(surface).toContain('if (!nextTransition) {');
  });

  it('keeps route templates static on a transparent aligned surface', () => {
    const outerSkeleton = skeleton.match(
      /data-page-turn-skeleton[\s\S]*?<span className="sr-only"/,
    )?.[0] ?? '';

    expect(outerSkeleton).toContain("'pointer-events-none absolute inset-0 z-20'");
    expect(outerSkeleton).toContain("'pt-[var(--c-page-header-h)]'");
    expect(outerSkeleton).toContain('px-3 sm:px-5 md:px-12');
    expect(outerSkeleton).not.toMatch(/\bbg-/);
    expect(skeleton).not.toMatch(/MutationObserver|ResizeObserver|getBoundingClientRect/);
  });

  it('adds no page-turn dependency', () => {
    expect(packageJson).not.toMatch(/(?:page-flip|page-turn|turn\.js)/i);
    expect(packageLock).not.toMatch(/(?:page-flip|page-turn|turn\.js)/i);
  });
});