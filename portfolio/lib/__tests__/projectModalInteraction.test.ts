import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectsPage = fs.readFileSync(
  path.join(process.cwd(), 'app', 'projects', 'page.tsx'),
  'utf8',
);

describe('Projects modal interaction contract', () => {
  it('opens the indexed project when the card surface is clicked', () => {
    expect(projectsPage).toMatch(/onClick=\{\(event\) => handleCardClick\(event, i\)\}/);
    expect(projectsPage).toMatch(/const handleCardClick = useCallback[\s\S]*?openProject\(index\);/);
  });

  it('leaves nested links and buttons in control of their own actions', () => {
    expect(projectsPage).toMatch(/event\.target\.closest\('a, button'\)/);
    expect(projectsPage).toMatch(/<button[\s\S]*?onClick=\{\(\) => openProject\(i\)\}[\s\S]*?aria-label=\{`View details for \$\{proj\.name\}`\}/);
  });
});