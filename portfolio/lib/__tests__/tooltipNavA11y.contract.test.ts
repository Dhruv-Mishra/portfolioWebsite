import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('tooltip and nav a11y contracts', () => {
  it('animates tooltips with scoped CSS instead of Framer', () => {
    const tooltip = read('components/ui/Tooltip.tsx');
    const css = read('app/globals.css');
    expect(tooltip).not.toMatch(/from ['"]framer-motion['"]/);
    expect(tooltip).not.toContain('AnimatePresence');
    expect(tooltip).toContain('role="tooltip"');
    expect(tooltip).toContain('useDesktopOnly');
    expect(tooltip).toContain('delay = 400');
    expect(tooltip).toContain(':focus-visible');
    expect(tooltip).toContain('createPortal');
    expect(tooltip).toContain('sketch-tooltip');
    expect(css).toContain('.sketch-tooltip');
    expect(css).toContain('@keyframes sketchTooltipIn');
  });

  it('puts aria-current on the nav Link, not the clipped tab face', () => {
    const navigation = read('components/Navigation.tsx');
    const afterLink = navigation.slice(navigation.indexOf('<Link'));
    const linkOpen = afterLink.slice(0, afterLink.indexOf('<div'));
    const innerDiv = afterLink.slice(afterLink.indexOf('<div'), afterLink.indexOf('{item.name}'));
    expect(linkOpen).toContain("aria-current': 'page'");
    expect(linkOpen).toContain('focus-visible:outline-2');
    expect(innerDiv).not.toContain('aria-current');
  });
});
