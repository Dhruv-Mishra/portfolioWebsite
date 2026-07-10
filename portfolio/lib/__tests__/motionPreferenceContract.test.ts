import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const css = fs.readFileSync(path.join(projectRoot, 'app', 'globals.css'), 'utf8');
const reducedContract = css.slice(css.lastIndexOf('/* Shared reduced-motion contract'));

describe('motion preference contract', () => {
  it('never forces full motion over the operating-system preference', () => {
    const provider = fs.readFileSync(
      path.join(projectRoot, 'components', 'ThemeProvider.tsx'),
      'utf8',
    );

    expect(provider).toContain('motionPreference === "reduced" ? "always" : "user"');
    expect(provider).not.toMatch(/reducedMotion=["{]never/);
  });

  it('scopes CSS reduction to decorative surfaces instead of all descendants', () => {
    expect(reducedContract).toContain('[data-sticker-toast]');
    expect(reducedContract).toContain('[data-disco-motion]');
    expect(reducedContract).toContain('.sticker-card--superuser::after');
    expect(reducedContract).not.toMatch(/html\[data-motion="reduced"\]\s+\*/);
    expect(reducedContract).not.toContain('terminal-auth-shake');
  });

  it.each([
    ['operating-system', '@media (prefers-reduced-motion: reduce)'],
    ['explicit', 'html[data-motion="reduced"]'],
  ])('settles hero, navigation, and entrance motion for the %s path', (_path, marker) => {
    expect(reducedContract).toContain(marker);
    expect(reducedContract).toContain('.animate-hero-subtitle');
    expect(reducedContract).toContain('.animate-hero-badge');
    expect(reducedContract).toContain('.animate-nav-tab');
    expect(reducedContract).toContain('.animate-social-link');
    expect(reducedContract).toContain('.animate-page-sheet');
    expect(reducedContract).toContain('html[data-disco="on"] body');
    expect(reducedContract).toContain('nav[aria-label="Main navigation"] > a > div');
    expect(reducedContract).toContain('[data-social-sidebar] > *');
    expect(reducedContract).toMatch(/animation:\s*none\s*!important/);
    expect(reducedContract).toMatch(/opacity:\s*1\s*!important/);
    expect(reducedContract).toContain('transform: translateY(-25px) !important');
    expect(reducedContract).not.toContain('terminal-auth-shake');
  });

  it('pre-paint bootstrap handles only public appearance and motion fields', () => {
    const layout = fs.readFileSync(path.join(projectRoot, 'app', 'layout.tsx'), 'utf8');
    const bootstrap = layout.match(/const SITE_PREFS_BOOTSTRAP = `([^`]+)`;/)?.[1] ?? '';

    expect(bootstrap).toContain("motionPreference==='reduced'");
    expect(bootstrap).not.toContain('experimentalCommands');
    expect(bootstrap).not.toContain('prefExperimental');
  });
});