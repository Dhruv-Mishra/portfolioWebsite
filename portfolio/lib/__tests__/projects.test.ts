import { describe, expect, it } from 'vitest';
import { parseMarks, stripMarks } from '@/lib/markedText';
import { FEATURED_PROJECT_SLUGS, PROJECTS, getProjectBySlug, getProjectThumbnail, getProjectVideoSources } from '@/lib/projects';
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

  it.each(PROJECTS)('$slug has a two-line tile summary, a longer marked-up story, and a worded role', project => {
    const story = stripMarks(project.details);
    expect(project.summary.length).toBeGreaterThan(0);
    expect(project.summary.length).toBeLessThanOrEqual(50);
    expect(story.length).toBeGreaterThan(project.summary.length);
    expect(story.length).toBeLessThanOrEqual(300);
    expect(story).not.toMatch(/\*\*|==|~~/);
    expect(parseMarks(project.details).some(segment => segment.mark)).toBe(true);
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

describe('inline marks', () => {
  it('splits strong, highlight and wavy marks and leaves unmatched markers as text', () => {
    expect(parseMarks('A **bold** and ==lit== bit, ~~wavy~~ end ** odd')).toEqual([
      { text: 'A ', mark: null },
      { text: 'bold', mark: 'strong' },
      { text: ' and ', mark: null },
      { text: 'lit', mark: 'highlight' },
      { text: ' bit, ', mark: null },
      { text: 'wavy', mark: 'wavy' },
      { text: ' end ** odd', mark: null },
    ]);
    expect(stripMarks('==3x== under ~~load~~')).toBe('3x under load');
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
  it('takes the thumbnail from the video stem, and the still when there is no video', () => {
    expect(getProjectThumbnail(project)).toBe('/resources/video/jarvis-voice-agent.webp');
    expect(getProjectThumbnail({ ...project, video: 'jarvis-new' })).toBe('/resources/video/jarvis-new.webp');
    expect(getProjectThumbnail({ ...project, video: null })).toBe(project.image);
  });
});
