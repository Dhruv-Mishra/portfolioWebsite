import { describe, expect, it } from 'vitest';
import { PROJECT_ACTIONS } from '@/lib/projectCatalog';
import { PROJECT_SLUG_LIST } from '@/lib/projectSlugs';

describe('project slug leaf module', () => {
  it('matches the catalog slugs in order', () => {
    expect(PROJECT_ACTIONS.map(project => project.slug)).toEqual([...PROJECT_SLUG_LIST]);
  });

  it('keeps regex whitespace escapes in project keywords', () => {
    const portfolio = PROJECT_ACTIONS.find(project => project.slug === 'personal-portfolio');
    const pattern = new RegExp(portfolio?.keywords.join('|') ?? '$^', 'i');
    expect(pattern.test('show me the portfolio project')).toBe(true);
    expect(pattern.test('tell me about this site')).toBe(true);
  });
});
