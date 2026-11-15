import { describe, expect, it } from 'vitest';
import { FEATURED_PROJECT_SLUGS, PROJECTS, getProjectBySlug, getProjectVideoSources } from '@/lib/projects';
import { PROJECT_SLUG_LIST } from '@/lib/projectSlugs';

describe('project records', () => {
  it('covers every catalog slug once in the intended reading order', () => {
    expect(PROJECTS.map(project => project.slug)).toEqual([
      'jarvis-voice-agent', 'personal-portfolio', 'invoke', 'cropio', 'port-solace',
      'fluent-ui-android', 'bloom-filter-research', 'ivc-vital-checkup',
      'hybrid-recommender', 'course-evaluator', 'atomvault',
    ]);
    expect(new Set(PROJECTS.map(project => project.slug))).toEqual(new Set(PROJECT_SLUG_LIST));
    expect(FEATURED_PROJECT_SLUGS).toEqual(PROJECTS.slice(0, 6).map(project => project.slug));
  });

  it.each(PROJECTS)('$slug has concise plain-text copy and a worded role', project => {
    expect(project.summary.length).toBeGreaterThan(0);
    expect(project.summary.length).toBeLessThanOrEqual(90);
    expect(project.details.length).toBeGreaterThan(project.summary.length);
    expect(project.details.length).toBeLessThanOrEqual(300);
    expect(project.role).not.toContain('+');
    expect(getProjectBySlug(project.slug)).toBe(project);
  });

  it('offers demos only where useful, and identifies the research paper', () => {
    expect(PROJECTS.filter(project => project.demo).map(project => project.slug)).toEqual([
      'jarvis-voice-agent', 'cropio', 'port-solace',
    ]);
    expect(getProjectBySlug('bloom-filter-research').linkLabel).toBe('Read the paper');
    expect(getProjectBySlug('jarvis-voice-agent').highlights).toHaveLength(2);
  });
});

describe('project video sources', () => {
  const project = getProjectBySlug('jarvis-voice-agent');
  it('prefers AV1 and retains the H.264 fallback', () => {
    expect(getProjectVideoSources(project)).toEqual([
      { src: '/resources/video/jarvis-voice-agent.av1.mp4', type: 'video/mp4; codecs="av01.0.04M.08, opus"' },
      { src: '/resources/video/jarvis-voice-agent.mp4', type: 'video/mp4' },
    ]);
  });
  it('uses replacement stems without changing project deep links', () => {
    expect(getProjectVideoSources({ ...project, video: 'jarvis-new' })?.map(source => source.src)).toEqual([
      '/resources/video/jarvis-new.av1.mp4', '/resources/video/jarvis-new.mp4',
    ]);
  });
  it('omits video for an explicitly image-only project', () => {
    expect(getProjectVideoSources({ ...project, video: null })).toBeNull();
  });
});
