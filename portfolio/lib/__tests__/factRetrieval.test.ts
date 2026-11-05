// Unit tests for lib/factRetrieval.server.ts.
// The vitest alias in vitest.config.ts neutralises `server-only` so these
// modules can be imported directly from Node.
import { describe, it, expect } from 'vitest';

import {
  cosineSimilarity,
  partitionFacts,
  retrieveRelevantFacts,
  getRelevantFactContext,
  getFactBySlug,
} from '@/lib/factRetrieval.server';
import type { EmbeddedFact } from '@/lib/factTypes';

function mkFact(overrides: Partial<EmbeddedFact>): EmbeddedFact {
  return {
    id: 'test',
    text: 'body',
    tags: [],
    priority: 0,
    anchor: false,
    category: 'core',
    embedding: [1, 0, 0],
    contentHash: 'hash',
    ...overrides,
  };
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical normalised vectors', () => {
    const vector = [1 / Math.SQRT2, 1 / Math.SQRT2];
    expect(cosineSimilarity(vector, vector)).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('returns 0 for empty or mismatched inputs', () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });
});

describe('partitionFacts', () => {
  it('splits anchor from non-anchor facts', () => {
    const facts = [
      mkFact({ id: 'a', anchor: true }),
      mkFact({ id: 'b', anchor: false }),
      mkFact({ id: 'c', anchor: true }),
    ];
    const { anchors, rankable } = partitionFacts(facts);
    expect(anchors.map((f) => f.id)).toEqual(['a', 'c']);
    expect(rankable.map((f) => f.id)).toEqual(['b']);
  });

  it('returns empty lists for an empty input', () => {
    expect(partitionFacts([])).toEqual({ anchors: [], rankable: [] });
  });
});

describe('retrieveRelevantFacts — integration against committed bundle', () => {
  it('always includes anchor facts first', async () => {
    const facts = await retrieveRelevantFacts('hi', { limit: 8 });
    expect(facts.length).toBeGreaterThan(0);
    // The bundle has 4 anchor facts (core-identity, core-site, core-stack, core-work-shell).
    const anchors = facts.filter((f) => f.anchor);
    expect(anchors.length).toBeGreaterThanOrEqual(3);
    expect(anchors[0].anchor).toBe(true);
  });

  it('empty query still returns anchors (graceful fallback)', async () => {
    const facts = await retrieveRelevantFacts('', { limit: 4 });
    // When query can't be embedded we fall through to priority-sorted anchors
    // plus priority-sorted rankable. Anchors must still be present.
    expect(facts.some((f) => f.anchor)).toBe(true);
    expect(facts.length).toBeGreaterThan(0);
  });

  it('surfaces cropio-relevant facts when asked about cropio', async () => {
    const facts = await retrieveRelevantFacts('tell me about cropio and its architecture', { limit: 8 });
    const ids = facts.map((f) => f.id);
    expect(ids).toContain('project-cropio');
  });

  it('force-includes the matching project fact even at a three-fact limit', async () => {
    const cropio = await retrieveRelevantFacts('tell me about cropio', { limit: 3 });
    expect(cropio.map((fact) => fact.id)).toContain('project-cropio');

    const jarvis = await retrieveRelevantFacts('tell me about jarvis voice agent', { limit: 3 });
    expect(jarvis.map((fact) => fact.id)).toContain('project-jarvis-voice-agent');
  });

  it('skips anchors for cropio and adds only strong tag matches when includeAnchors is false', async () => {
    const facts = await retrieveRelevantFacts('tell me about cropio', { limit: 3, includeAnchors: false });
    expect(facts.map((fact) => fact.id)).toEqual(['project-cropio']);

    const withStack = await retrieveRelevantFacts('tell me about cropio and your python projects', { limit: 3, includeAnchors: false });
    expect(withStack[0].id).toBe('project-cropio');
    expect(withStack).toHaveLength(3);
    expect(withStack.slice(1).every((fact) => fact.tags.includes('python') || fact.tags.includes('projects'))).toBe(true);
  });

  it('answers from the latest turn even when an earlier turn named another topic', async () => {
    const afterPc = await retrieveRelevantFacts('what do you do at microsoft?', {
      limit: 8,
      followUpContext: 'what are your pc specs?',
    });
    const afterProject = await retrieveRelevantFacts('what did you major in?', {
      limit: 2,
      includeAnchors: false,
      followUpContext: 'show me cropio',
    });

    expect(afterPc.map((fact) => fact.id)).toContain('resume-microsoft-current');
    expect(afterPc.map((fact) => fact.id)).not.toContain('personal-pc-build');
    expect(afterProject[0].id).toBe('resume-education');
    expect(afterProject.map((fact) => fact.id)).not.toContain('project-cropio');
  });

  it('keeps the earlier topic for a follow-up that names none', async () => {
    const facts = await retrieveRelevantFacts('how long did it take?', {
      limit: 2,
      includeAnchors: false,
      followUpContext: 'tell me about port solace',
    });

    expect(facts.map((fact) => fact.id)).toEqual(['project-port-solace']);
  });

  it('covers everyday phrasings for projects, school, work history, and hobbies', async () => {
    const topIds = async (query: string) => (await retrieveRelevantFacts(query, { limit: 4, includeAnchors: false }))
      .map((fact) => fact.id);

    expect(await topIds('what projects have you built?')).toContain('projects-overview');
    expect(await topIds('where did you go to school?')).toContain('resume-education');
    expect(await topIds('did you study computer science?')).toEqual(['resume-education']);
    expect(await topIds('which companies have you worked at?')).toEqual(expect.arrayContaining([
      'resume-microsoft-current',
      'resume-microsoft-intern',
      'resume-growindigo',
    ]));
    expect(await topIds('what do you like to do outside of work?')).toContain('personal-hobbies');
    expect(await topIds('have you worked with kubernetes?')).toEqual([]);
  });

  it('keeps the Matrix puzzle fact out of sticker and terminal questions', async () => {
    const stickers = await retrieveRelevantFacts('how do I unlock stickers?', { limit: 8 });
    const puzzle = await retrieveRelevantFacts('how do I escape the matrix?', { limit: 8 });

    expect(stickers.map((fact) => fact.id)).toContain('site-stickers');
    expect(stickers.map((fact) => fact.id)).not.toContain('site-matrix-puzzle');
    expect(puzzle.map((fact) => fact.id)).toContain('site-matrix-puzzle');
  });

  it('adds no ranked facts when the question shares no tag with any fact', async () => {
    for (const query of ['What is 7 + 5?', 'Why are you in noida?', 'how about you?']) {
      const facts = await retrieveRelevantFacts(query, { limit: 6 });
      expect(facts.every((fact) => fact.anchor), query).toBe(true);
    }
  });

  it('matches curated tags across simple phrasing variants', async () => {
    const travel = await retrieveRelevantFacts('where have you traveled?', { limit: 2, includeAnchors: false });
    const games = await retrieveRelevantFacts('what games do you play', { limit: 2, includeAnchors: false });

    expect(travel.map((fact) => fact.id)).toEqual(['personal-travel']);
    expect(games.map((fact) => fact.id).sort()).toEqual(['personal-games', 'project-port-solace']);
  });

  it('surfaces terminal-related facts when asked about terminal commands', async () => {
    const facts = await retrieveRelevantFacts('what commands can I type in the terminal', { limit: 8 });
    const ids = facts.map((f) => f.id);
    expect(ids).toContain('site-terminal');
  });

  it('keeps six-fact terminal context compact without dropping terminal safeguards', async () => {
    const context = await getRelevantFactContext('what commands can I type in the terminal', { limit: 6 });

    expect(context.length).toBeLessThan(4_000);
    expect(context).toContain('help, about, projects');
    expect(context).toContain('sitewide speaker toggle');
    expect(context).toContain('require a second confirmation with `yes`');
    expect(context).toContain('only its on-screen `WAKE UP` or later escape button can dismiss it');
    expect(context).toContain('Disco exits through `disco off` and stays dark');
  });

  it('keeps Matrix-specific questions on the dedicated puzzle retrieval path', async () => {
    const facts = await retrieveRelevantFacts('give me a Matrix puzzle hint in the terminal', { limit: 6 });

    expect(facts.map((fact) => fact.id)).toContain('site-matrix-puzzle');
  });

  it('grounds keyboard help in the remaining opt-in shortcuts', async () => {
    const facts = await retrieveRelevantFacts('keyboard shortcuts hotkeys question mark', { limit: 6 });
    const shortcuts = facts.find((fact) => fact.id === 'site-shortcuts');

    expect(shortcuts?.text).toContain('`?` opens the shortcuts overlay');
    expect(shortcuts?.text).toContain('`t` toggles the theme');
    expect(shortcuts?.text).not.toMatch(/(?:cmd|ctrl)\s*\+\s*k/i);
  });

  it('surfaces the about-page timeline fact when asked about the experience timeline', async () => {
    const facts = await retrieveRelevantFacts('experience timeline career filters about page', { limit: 8 });
    const ids = facts.map((fact) => fact.id);
    expect(ids).toContain('site-experience-timeline');
  });

  it('force-includes exact PC build facts for hardware/spec queries', async () => {
    const facts = await retrieveRelevantFacts('what are your pc specs?', { limit: 6 });
    const pcFact = facts.find((fact) => fact.id === 'personal-pc-build');

    expect(pcFact).toBeDefined();
    expect(pcFact?.text).toContain('RTX 3080 Ti');
    expect(pcFact?.text).toContain('i5-13600KF');
    expect(pcFact?.text).toContain('6400 MHz CL32');
  });

  it('respects custom limit', async () => {
    const facts = await retrieveRelevantFacts('microsoft work', { limit: 3 });
    expect(facts.length).toBeLessThanOrEqual(3);
  });

  it('returns unique fact ids', async () => {
    const facts = await retrieveRelevantFacts('dhruv projects resume hobbies', { limit: 12 });
    const ids = facts.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getFactBySlug', () => {
  it('finds project facts by their slug', () => {
    const cropio = getFactBySlug('cropio');
    expect(cropio).not.toBeNull();
    expect(cropio?.text).toMatch(/Cropio/i);
  });

  it('returns null for project facts without a fact entry', () => {
    // fluent-ui-android has a fact — positive case
    expect(getFactBySlug('fluent-ui-android')).not.toBeNull();
  });
});
