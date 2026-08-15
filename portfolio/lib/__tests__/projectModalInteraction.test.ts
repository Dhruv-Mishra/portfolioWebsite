import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectsPage = fs.readFileSync(
  path.join(process.cwd(), 'app', 'projects', 'page.tsx'),
  'utf8',
);
const projectModal = fs.readFileSync(
  path.join(process.cwd(), 'components', 'ProjectModal.tsx'),
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

  it('opens an allowlisted project from the typed query or voice event', () => {
    expect(projectsPage).toContain('readProjectSlugFromSearch');
    expect(projectsPage).toContain('OPEN_PROJECT_EVENT');
    expect(projectsPage).toContain('openProjectBySlug');
  });

  it('keeps query opening, event opening, and close as top-level hooks', () => {
    expect(projectsPage).toMatch(/const handleCloseModal = useCallback\(\(\) => \{\s*closePanel\(\);\s*setSelectedProject\(null\);\s*\}, \[closePanel\]\);/);
    expect(projectsPage).toContain('readProjectSlugFromSearch');
    expect(projectsPage).toMatch(/if \(querySlug !== appliedQuerySlug\)/);
    expect(projectsPage).toMatch(/window\.addEventListener\(OPEN_PROJECT_EVENT, handler\);\s*return \(\) => window\.removeEventListener\(OPEN_PROJECT_EVENT, handler\);/);
    expect(projectsPage).not.toMatch(/const handleCloseModal = useCallback\([\s\S]*useEffect\([\s\S]*\}, \[closePanel\]\)/);
    expect(projectsPage).not.toMatch(/setSelectedPr\s*$/m);
    expect(projectsPage).not.toMatch(/openProjectBySlug\]\);oject/);
  });

  it('resets and retries playback when the mounted project source changes', () => {
    expect(projectModal).toContain('registerSiteActionHost(\'project-video\')');
    expect(projectModal).toMatch(/const attemptAutoplay = useCallback\(\(node: HTMLVideoElement, muted: boolean\) => \{/);
    expect(projectModal).toMatch(/node\.muted = muted;/);
    expect(projectModal).toMatch(/void node\.play\(\)[\s\S]*?\.catch\(\(\) => \{[\s\S]*?setShowPlayButton\(true\);/);
    expect(projectModal).toMatch(/useEffect\(\(\) => \{[\s\S]*?video\.pause\(\);[\s\S]*?video\.currentTime = 0;[\s\S]*?attemptAutoplay\(video, isMuted\);[\s\S]*?\}, \[attemptAutoplay, hasVideo, isMuted, project, videoSrc\]\);/);
    expect(projectModal).not.toMatch(/setIsMuted\(true\);[\s\S]*?node\.muted = true;/);
  });
});