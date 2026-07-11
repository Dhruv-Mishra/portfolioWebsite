import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.join(process.cwd(), 'components', 'SocialSidebar.tsx'),
  'utf8',
);
const pageTurnSurface = fs.readFileSync(
  path.join(process.cwd(), 'components', 'PageTurnSurface.tsx'),
  'utf8',
);
const sketchbookLayout = fs.readFileSync(
  path.join(process.cwd(), 'components', 'SketchbookLayout.tsx'),
  'utf8',
);

describe('mobile social bar component contract', () => {
  it('observes the real scroll owner with passive requestAnimationFrame handling', () => {
    expect(pageTurnSurface.match(/data-route-scroll-container/g)).toHaveLength(1);
    expect(sketchbookLayout).toMatch(/id="main-content"[\s\S]*?overflow-hidden/);
    expect(sketchbookLayout).not.toMatch(/id="main-content"[\s\S]*?overflow-y-auto/);
    expect(source).toContain("document.querySelector<HTMLElement>('[data-route-scroll-container]')");
    expect(source).toContain("addEventListener('scroll', handleScroll, { passive: true })");
    expect(source).toContain('requestFrame: window.requestAnimationFrame.bind(window)');
    expect(source).toContain("removeEventListener('scroll', handleScroll)");
    expect(source).not.toContain("window.addEventListener('scroll'");
  });

  it('resets on route remount and direct interaction while preserving focus access', () => {
    expect(source).toContain('<MobileSocialBar key={pathname}>');
    expect(source).toContain('onPointerDownCapture={reveal}');
    expect(source).toContain('onFocusCapture={() => controllerRef.current?.setFocusWithin(true)}');
    expect(source).toContain('onBlurCapture={(event) => {');
    expect(source).not.toContain('aria-hidden={!isVisible}');
  });

  it('animates an inner fixed layer without changing layout geometry', () => {
    expect(source).toContain('data-mobile-social-bar-visible={isVisible');
    expect(source).toContain("y: isVisible ? '0%' : '200%'");
    expect(source).toContain('transition={reducedMotion');
    expect(source).toContain("style={{ pointerEvents: isVisible ? 'auto' : 'none' }}");
  });
});