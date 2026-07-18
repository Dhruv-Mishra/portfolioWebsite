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

  it('keeps the social rail but omits the redundant settings link on its own route', () => {
    expect(source).toContain("const isSettingsRoute = pathname === '/settings';");
    expect(source).toContain('{!isSettingsRoute && <SettingsLink onPress={openPanel} />}');
    expect(source).toContain('{!isSettingsRoute && <SettingsLink isMobile onPress={openPanel} />}');
  });

  it('keeps desktop socials intact while mobile omits CP History for an eight-control two-row drawer', () => {
    const github = source.indexOf('name: "GitHub"');
    const linkedIn = source.indexOf('name: "LinkedIn"');
    const email = source.indexOf('name: "Email"');
    const phone = source.indexOf('name: "Phone"');
    const codeforces = source.indexOf('name: "Codeforces"');
    const cpHistory = source.indexOf('name: "CP History"');
    const mobileSocials = source.indexOf('const MOBILE_SOCIALS = SOCIALS.filter((social) => social.name !== "CP History");');
    const feedback = source.indexOf('onFeedbackClick && (', mobileSocials);
    const theme = source.indexOf('<MobileThemeButton onPress={toggle} />', feedback);
    const settings = source.indexOf('<SettingsLink isMobile onPress={openPanel} />', theme);

    expect(github).toBeLessThan(linkedIn);
    expect(linkedIn).toBeLessThan(email);
    expect(email).toBeLessThan(phone);
    expect(phone).toBeLessThan(codeforces);
    expect(codeforces).toBeLessThan(cpHistory);
    expect(mobileSocials).toBeGreaterThan(cpHistory);
    expect(feedback).toBeLessThan(theme);
    expect(theme).toBeLessThan(settings);
    expect(source).toContain('grid-cols-[repeat(4,40px)] gap-1');
    expect(source).toContain("isDrawerExpanded ? 'w-max p-1.5'");
    expect(source).toContain('{MOBILE_SOCIALS.map((social) => (');
    expect(source).toContain('{onFeedbackClick && (');
    expect(source).toContain('{!isSettingsRoute && <SettingsLink isMobile onPress={openPanel} />}');
  });

  it('uses compact 40px mobile controls with 14px icons', () => {
    expect(source).toContain('flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--c-paper)]/85');
    expect(source).toContain('<social.icon size={14} strokeWidth={2.5} />');
    expect(source).toContain('Settings size={isMobile ? 14 : 24}');
    expect(source).toContain('width="14" height="14"');
    expect(source).toContain('<Sun size={14} strokeWidth={2.5} />');
    expect(source).toContain('<Moon size={14} strokeWidth={2.5} />');
    expect(source).toContain('<MessageSquare size={14} strokeWidth={2.5} />');
  });

  it('keeps the mobile drawer and circular controls translucent', () => {
    expect(source).toContain('bg-[var(--c-paper)]/85');
  });

  it('separates manual drawer expansion from scroll visibility with an accessible boundary toggle', () => {
    expect(source).toContain('const [isDrawerExpanded, setIsDrawerExpanded] = React.useState(true);');
    expect(source).toContain('isDrawerExpanded && children');
    expect(source).toContain('onClick={() => setIsDrawerExpanded((isExpanded) => !isExpanded)}');
    expect(source).toContain('id="mobile-social-drawer"');
    expect(source).toContain('id="mobile-social-drawer-content"');
    expect(source).toContain('aria-controls="mobile-social-drawer-content"');
    expect(source).not.toContain('aria-controls="mobile-social-drawer"');
    expect(source).toContain('aria-expanded={isDrawerExpanded}');
    expect(source).toContain('role="complementary"');
    expect(source).toContain('aria-label="Social media links"');
    expect(source.indexOf('aria-controls="mobile-social-drawer-content"')).toBeLessThan(
      source.indexOf('id="mobile-social-drawer-content"'),
    );
    expect(source).toContain("title={isDrawerExpanded ? 'Collapse social drawer' : 'Expand social drawer'}");
    expect(source).toContain('ChevronDown');
    expect(source).toContain('ChevronUp');
    expect(source).toContain('h-8 w-8');
    expect(source).toContain("isDrawerExpanded ? '-top-9 right-1' : '-top-8 right-1'");
    expect(source).toContain('<ChevronDown size={14} strokeWidth={2.5} />');
    expect(source).toContain('<ChevronUp size={14} strokeWidth={2.5} />');
  });

  it('uses a deterministic native transform for drawer visibility without changing layout geometry', () => {
    expect(source).toContain('data-mobile-social-bar-visible={isVisible');
    expect(source).toContain("transform: isVisible ? 'translateY(0)' : 'translateY(calc(100% + 4rem))'");
    expect(source).toContain("transitionProperty: 'transform'");
    expect(source).toContain("transitionDuration: reducedMotion ? '0ms' : '300ms'");
    expect(source).toContain("transitionTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)'");
    expect(source).toContain("pointerEvents: isVisible ? 'auto' : 'none'");
    expect(source).not.toMatch(/<m\.div[\s\S]*?id=\"mobile-social-drawer\"/);
    expect(source).not.toMatch(/id=\"mobile-social-drawer\"[\s\S]*?\banimate=/);
  });
});