import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();

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
    const css = fs.readFileSync(path.join(projectRoot, 'app', 'globals.css'), 'utf8');
    const reducedBlock = css.match(
      /@layer utilities \{\s+html\[data-motion="reduced"\][\s\S]+$/,
    )?.[0] ?? '';

    expect(reducedBlock).toContain('[data-sticker-toast]');
    expect(reducedBlock).toContain('[data-disco-motion]');
    expect(reducedBlock).not.toMatch(/html\[data-motion="reduced"\]\s+\*/);
    expect(reducedBlock).not.toContain('terminal-auth-shake');
  });

  it('pre-paint bootstrap handles only public appearance and motion fields', () => {
    const layout = fs.readFileSync(path.join(projectRoot, 'app', 'layout.tsx'), 'utf8');
    const bootstrap = layout.match(/const SITE_PREFS_BOOTSTRAP = `([^`]+)`;/)?.[1] ?? '';

    expect(bootstrap).toContain("motionPreference==='reduced'");
    expect(bootstrap).not.toContain('experimentalCommands');
    expect(bootstrap).not.toContain('prefExperimental');
  });
});