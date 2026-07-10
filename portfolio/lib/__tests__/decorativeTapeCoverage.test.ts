import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DECORATIVE_TAPE_CONSUMERS = new Map([
  ['app/about/page.tsx', 2],
  ['app/error.tsx', 1],
  ['app/not-found.tsx', 2],
  ['app/projects/page.tsx', 1],
  ['app/resume/page.tsx', 3],
  ['components/ProjectModal.tsx', 1],
]);

const readSource = (relativePath: string) => fs.readFileSync(
  path.join(process.cwd(), relativePath),
  'utf8',
);

describe('decorative tape preference coverage', () => {
  it('marks every production TAPE_STYLE_DECOR instance with the shared visibility contract', () => {
    for (const [relativePath, expectedCount] of DECORATIVE_TAPE_CONSUMERS) {
      const source = readSource(relativePath);
      const styleUses = source.match(/style=\{TAPE_STYLE_DECOR\}|\.\.\.TAPE_STYLE_DECOR/g) ?? [];
      const markers = source.match(/data-tape-strip/g) ?? [];

      expect(styleUses, relativePath).toHaveLength(expectedCount);
      expect(markers, relativePath).toHaveLength(expectedCount);
    }
  });

  it('keeps the preference selector narrowly scoped to the established tape marker', () => {
    const globals = readSource('app/globals.css');
    expect(globals).toContain('html:not([data-pref-tape="on"]) [data-tape-strip]');
    expect(globals).toMatch(/html:not\(\[data-pref-tape="on"\]\) \[data-tape-strip\] \{\s*display: none;/);
  });
});