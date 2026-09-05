import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.join(process.cwd(), 'components', 'SocialSidebar.tsx'),
  'utf8',
);
const routeScrollSurface = fs.readFileSync(
  path.join(process.cwd(), 'components', 'RouteScrollSurface.tsx'),
  'utf8',
);
const sketchbookLayout = fs.readFileSync(
  path.join(process.cwd(), 'components', 'SketchbookLayout.tsx'),
  'utf8',
);

describe('mobile social bar component contract', () => {
  it('keeps a single route scroller and no scroll inference', () => {
    expect(routeScrollSurface.match(/data-route-scroll-container/g)).toHaveLength(1);
    expect(sketchbookLayout).toMatch(/id="main-content"[\s\S]*?overflow-hidden/);
    expect(sketchbookLayout).not.toMatch(/id="main-content"[\s\S]*?overflow-y-auto/);
    expect(source).not.toContain("document.querySelector<HTMLElement>('[data-route-scroll-container]')");
    expect(source).not.toContain("addEventListener('scroll'");
    expect(source).not.toContain("addEventListener('touchstart'");
    expect(source).not.toContain("addEventListener('touchmove'");
    expect(source).not.toContain("addEventListener('wheel'");
    expect(source).not.toContain("window.addEventListener('keydown'");
    expect(source).not.toContain('createMobileSocialBarVisibilityController');
    expect(source).not.toContain('PAGE_TURN_NAVIGATION_EVENT');
    expect(source).not.toContain('mobileSocialBarVisibility');
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
    expect(source).toContain('grid-cols-[repeat(4,44px)] gap-1');
    expect(source).toContain("isDrawerExpanded ? 'w-max p-1.5'");
    expect(source).toContain('{MOBILE_SOCIALS.map((social) => (');
    expect(source).toContain('{onFeedbackClick && (');
    expect(source).toContain('{!isSettingsRoute && <SettingsLink isMobile onPress={openPanel} />}');
  });

  it('uses 44px mobile controls with compact 14px icons', () => {
    expect(source).toContain('flex h-11 w-11 shrink-0 items-center justify-center bg-[var(--c-paper)]/85');
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

  it('keeps an accessible explicit expand/collapse control', () => {
    expect(source).toContain('const [isDrawerExpanded, setIsDrawerExpanded] = React.useState(false);');
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
    expect(source).toContain('h-11 w-11');
    expect(source).toContain("isDrawerExpanded ? '-top-12 right-1' : '-top-11 right-1'");
    expect(source).toContain('<ChevronDown size={14} strokeWidth={2.5} />');
    expect(source).toContain('<ChevronUp size={14} strokeWidth={2.5} />');
  });

});