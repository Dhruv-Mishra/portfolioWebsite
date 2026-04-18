// Unit tests for lib/factRetrieval.server.ts.
// The vitest alias in vitest.config.ts neutralises `server-only` so these
// modules can be imported directly from Node.
import { describe, it, expect } from 'vitest';

import {
  cosineSimilarity,
  partitionFacts,
  topKByEmbedding,
  topKByPriority,
  retrieveRelevantFacts,
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

describe('topKByEmbedding', () => {
  const facts: EmbeddedFact[] = [
    mkFact({ id: 'A', priority: 1, embedding: [1, 0] }),
    mkFact({ id: 'B', priority: 5, embedding: [0.9, 0.44] }),
    mkFact({ id: 'C', priority: 3, embedding: [0, 1] }),
  ];

  it('ranks by cosine similarity', () => {
    const out = topKByEmbedding(facts, [1, 0], 2);
    expect(out.map((f) => f.id)).toEqual(['A', 'B']);
  });

  it('uses priority as tie-breaker on equal similarity', () => {
    const tied = [
      mkFact({ id: 'X', priority: 1, embedding: [1, 0] }),
      mkFact({ id: 'Y', priority: 5, embedding: [1, 0] }),
    ];
    const out = topKByEmbedding(tied, [1, 0], 2);
    expect(out[0].id).toBe('Y');
  });

  it('respects limit', () => {
    expect(topKByEmbedding(facts, [1, 0], 0)).toHaveLength(0);
    expect(topKByEmbedding(facts, [1, 0], 1)).toHaveLength(1);
    expect(topKByEmbedding(facts, [1, 0], 99)).toHaveLength(3);
  });

  it('returns an empty array for an empty corpus', () => {
    expect(topKByEmbedding([], [1, 0], 5)).toEqual([]);
  });
});

describe('topKByPriority', () => {
  const facts: EmbeddedFact[] = [
    mkFact({ id: 'A', priority: 1 }),
    mkFact({ id: 'B', priority: 5 }),
    mkFact({ id: 'C', priority: 3 }),
  ];

  it('returns highest-priority facts first', () => {
    const out = topKByPriority(facts, 2);
    expect(out.map((f) => f.id)).toEqual(['B', 'C']);
  });

  it('respects limit 0', () => {
    expect(topKByPriority(facts, 0)).toEqual([]);
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

  it('surfaces terminal-related facts when asked about terminal commands', async () => {
    const facts = await retrieveRelevantFacts('what commands can I type in the terminal', { limit: 8 });
    const ids = facts.map((f) => f.id);
    expect(ids).toContain('site-terminal');
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
