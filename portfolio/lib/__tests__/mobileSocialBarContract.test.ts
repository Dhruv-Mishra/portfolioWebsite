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

  it('preserves first-load visibility while route remounts start hidden', () => {
    expect(source).toContain('const hasHydrated = React.useSyncExternalStore(');
    expect(source).toContain('<MobileSocialBar key={pathname} initiallyRouteHidden={hasHydrated}>');
    expect(source).toContain('const [routeHiddenAtMount] = React.useState(() => initiallyRouteHidden);');
    expect(source).toContain('initiallyRouteHidden: routeHiddenAtMount,');
  });

  it('keeps direct interaction and focus support outside of the route gate', () => {
    expect(source).toContain('onPointerDownCapture={reveal}');
    expect(source).toContain('onFocusCapture={() => controllerRef.current?.setFocusWithin(true)}');
    expect(source).toContain('onBlurCapture={(event) => {');
    expect(source).not.toContain('aria-hidden={!isVisible}');
  });

  it('hides immediately for page turns and uses directional one-frame user scroll intent', () => {
    expect(source).toContain("import { PAGE_TURN_NAVIGATION_EVENT } from '@/lib/pageTurn';");
    expect(source).toContain('window.addEventListener(PAGE_TURN_NAVIGATION_EVENT, handlePageTurn)');
    expect(source).toContain('window.removeEventListener(PAGE_TURN_NAVIGATION_EVENT, handlePageTurn)');
    expect(source).toContain('controller.hideForRouteChange()');
    expect(source).toContain('const markPageDownIntent = () => {');
    expect(source).toContain('const clearUserScrollIntent = () => {');
    expect(source).toContain('window.requestAnimationFrame(() => {');
    expect(source).toContain('window.cancelAnimationFrame(userScrollIntentFrameRef.current);');
    expect(source).toContain('if (event.deltaY > 0) markPageDownIntent();');
    expect(source).toContain('if (clientY < lastTouchClientYRef.current) markPageDownIntent();');
    expect(source).toContain("['ArrowDown', 'PageDown', 'End'].includes(event.key)");
    expect(source).toContain("event.key === ' ' && !event.shiftKey");
    expect(source).toContain("scrollContainer.addEventListener('touchstart', handleTouchStart, { passive: true })");
    expect(source).toContain("scrollContainer.addEventListener('touchmove', handleTouchMove, { passive: true })");
    expect(source).toContain("scrollContainer.addEventListener('wheel', handleWheel, { passive: true })");
    expect(source).toMatch(/clearUserScrollIntent\(\);\s*controller\.handleScroll/);
    expect(source).toContain("scrollContainer.removeEventListener('touchstart', handleTouchStart)");
    expect(source).toContain("scrollContainer.removeEventListener('touchmove', handleTouchMove)");
    expect(source).toContain("scrollContainer.removeEventListener('wheel', handleWheel)");
    expect(source).toContain("window.addEventListener('keydown', handleKeyDown)");
  });

  it('keeps the desktop sidebar and chat exclusion intact', () => {
    expect(source).toContain('data-social-sidebar-layout="desktop"');
    expect(source).toContain('className="hidden md:flex fixed right-4 md:right-8 flex-col gap-6"');
    expect(source).toContain("const hideMobileBar = pathname === '/chat';");
    expect(source).toContain('{!hideMobileBar && (');
  });

  it('animates an inner fixed layer without changing layout geometry', () => {
    expect(source).toContain('data-mobile-social-bar-visible={isVisible');
    expect(source).toContain("y: isVisible ? '0%' : '200%'");
    expect(source).toContain('transition={reducedMotion');
    expect(source).toContain("style={{ pointerEvents: isVisible ? 'auto' : 'none' }}");
  });
});