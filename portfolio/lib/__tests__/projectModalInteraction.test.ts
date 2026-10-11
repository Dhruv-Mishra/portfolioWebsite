import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectsPage = fs.readFileSync(
  path.join(process.cwd(), 'app', 'projects', 'page.tsx'),
  'utf8',
);
const projectsLayout = fs.readFileSync(
  path.join(process.cwd(), 'app', 'projects', 'layout.tsx'),
  'utf8',
);
const gridController = fs.readFileSync(
  path.join(process.cwd(), 'components', 'ProjectGridController.tsx'),
  'utf8',
);
const projectModal = fs.readFileSync(
  path.join(process.cwd(), 'components', 'ProjectModal.tsx'),
  'utf8',
);

describe('Projects modal interaction contract', () => {
  it('keeps the card grid server-rendered and confines search params to a Suspense leaf', () => {
    expect(projectsPage).not.toMatch(/^["']use client["']/m);
    expect(projectsPage).not.toMatch(/useSearchParams|searchParams|useState|useEffect/);
    expect(projectsPage).toContain('<ProjectGridController');
    expect(projectsLayout).not.toContain('Suspense');
    expect(gridController).toMatch(/^"use client";/);
    expect(gridController).toMatch(/function ProjectQuerySync[\s\S]*?useSearchParams\(\)/);
    expect(gridController).toMatch(/<Suspense fallback=\{null\}>\s*<ProjectQuerySync onQuerySlug=\{handleQuerySlug\} \/>\s*<\/Suspense>/);
    expect(gridController.match(/useSearchParams\(\)/g)).toHaveLength(1);
  });

  it('opens the project when the card surface or details button is clicked', () => {
    expect(projectsPage).toContain('data-project-slug={proj.slug}');
    expect(projectsPage).toMatch(/<button[\s\S]*?aria-label=\{`View details for \$\{proj\.name\}`\}/);
    expect(gridController).toMatch(/<div className=\{className\} onClick=\{handleGridClick\}>/);
    expect(gridController).toMatch(/const handleGridClick = useCallback[\s\S]*?closest<HTMLElement>\('\[data-project-slug\]'\)[\s\S]*?openProjectBySlug\(slug\);/);
  });

  it('leaves nested links in control of their own navigation', () => {
    expect(projectsPage).toMatch(/data-project-source\s*aria-label=\{`View source for \$\{proj\.name\}`\}/);
    expect(gridController).toMatch(/closest\('\[data-project-source\]'\)\) \{\s*unlockSticker\('repo-hunter'\);\s*return;/);
    expect(gridController).toMatch(/if \(event\.target\.closest\('a'\)\) return;/);
  });

  it('opens an allowlisted project from the typed query or voice event', () => {
    expect(gridController).toContain('readProjectSlugFromSearch');
    expect(gridController).toContain('OPEN_PROJECT_EVENT');
    expect(gridController).toMatch(/const openProjectBySlug = useCallback\(\(slug: string\) => \{\s*if \(!isProjectSlug\(slug\)/);
  });

  it('keeps query opening, event opening, and close as top-level hooks', () => {
    expect(gridController).toMatch(/const handleCloseModal = useCallback\(\(\) => \{\s*closePanel\(\);\s*setSelectedSlug\(null\);\s*if \(querySlug\) \{\s*router\.replace\('\/projects'\);\s*\}\s*\}, \[closePanel, querySlug, router\]\);/);
    expect(gridController).toContain('CLOSE_PROJECT_EVENT');
    expect(gridController).toMatch(/const reportQuerySlug = useEffectEvent[\s\S]*?useEffect\(\(\) => \{\s*reportQuerySlug\(querySlug\);\s*\}, \[querySlug\]\);/);
    expect(gridController).toMatch(/window\.addEventListener\(OPEN_PROJECT_EVENT, handler\);\s*return \(\) => window\.removeEventListener\(OPEN_PROJECT_EVENT, handler\);/);
    expect(gridController).toMatch(/window\.addEventListener\(CLOSE_PROJECT_EVENT, handler\);\s*return \(\) => window\.removeEventListener\(CLOSE_PROJECT_EVENT, handler\);/);
  });

  it('resets and retries playback when the mounted project source changes', () => {
    expect(projectModal).toContain('registerSiteActionHost(\'project-video\')');
    expect(projectModal).toMatch(/if \(!project \|\| !hasVideo \|\| !hasMountedVideo\) return;/);
    expect(projectModal).toMatch(/const attemptAutoplay = useCallback\(\(node: HTMLVideoElement, muted: boolean\) => \{/);
    expect(projectModal).toMatch(/node\.muted = muted;/);
    expect(projectModal).toMatch(/void node\.play\(\)[\s\S]*?\.catch\(\(\) => \{[\s\S]*?setShowPlayButton\(true\);/);
    expect(projectModal).toMatch(/useEffect\(\(\) => \{[\s\S]*?video\.pause\(\);[\s\S]*?video\.currentTime = 0;[\s\S]*?video\.muted = false;[\s\S]*?attemptAutoplay\(video, false\);[\s\S]*?\}, \[attemptAutoplay, hasVideo, project, videoSrc\]\);/);
    expect(projectModal).not.toMatch(/\[attemptAutoplay, hasVideo, isMuted, project, videoSrc\]/);
    expect(projectModal).not.toMatch(/setIsMuted\(true\);[\s\S]*?node\.muted = true;/);
  });

  it('starts every project preview unmuted and keeps the play fallback', () => {
    expect(projectModal).toContain('const isMutedRef = useRef(false)');
    expect(projectModal).toContain('const [isMuted, setIsMuted] = useState(false)');
    expect(projectModal).toContain('isMutedRef.current = false');
    expect(projectModal).toContain('video.muted = false');
    expect(projectModal).toContain('muted={isMuted}');
    expect(projectModal).toContain('setShowPlayButton(true)');
  });

  it('registers the preview host only after play can be attempted', () => {
    expect(projectModal).toMatch(/setHasMountedVideo\(node !== null\)/);
    expect(projectModal).toMatch(/preload="metadata"/);
    expect(projectModal).not.toMatch(/preload="none"/);
    expect(projectModal).toMatch(/await video\.play\(\);/);
    expect(projectModal).toMatch(/attachSiteActionResult\(event, reportPlayResult\(\)/);
    expect(projectModal).not.toMatch(/void playVideo\(\)/);
    expect(projectModal).toMatch(/errorCode: 'project-video-unavailable'/);
    expect(projectModal).toContain('VIDEO_PLAY_RETRY_MS = 1000');
    expect(projectModal).toContain('VIDEO_PLAY_RETRY_STEP_MS = 50');
  });

  it('pauses detached video without destroying src and cancels stale generations', () => {
    expect(projectModal).toMatch(/if \(previousVideo !== node\) playGenerationRef\.current \+= 1;/);
    expect(projectModal).toMatch(/if \(previousVideo && previousVideo !== node\) \{\s*previousVideo\.pause\(\);\s*\}/);
    expect(projectModal).not.toMatch(/previousVideo\.removeAttribute\(['"]src['"]\)/);
    expect(projectModal).not.toMatch(/previousVideo\.load\(\)/);
    expect(projectModal).toMatch(/return \(\) => \{\s*playGenerationRef\.current \+= 1;/);
    expect(projectModal).toMatch(/playGeneration !== playGenerationRef\.current \|\| videoRef\.current !== video/);
    expect(projectModal).toMatch(/playGeneration !== playGenerationRef\.current \|\| videoRef\.current !== node/);
  });
});