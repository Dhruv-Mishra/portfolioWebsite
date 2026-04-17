// Smoke test for the build-embeddings pipeline.
// We don't spawn a subprocess here — we import the helpers the script uses
// (loadFacts, localEmbed, l2Normalize) and verify the end-to-end shape of
// the bundle we'd write to disk. Plus a full test using the already-built
// committed bundle to confirm runtime invariants.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { hashContent, loadFacts } from '@/lib/factLoader';
import { localEmbed, l2Normalize, LOCAL_EMBEDDING_MODEL_ID, LOCAL_EMBEDDING_DIMENSION } from '@/lib/localEmbedding';
import type { EmbeddedFact, EmbeddingsBundle } from '@/lib/factTypes';
import bundle from '@/lib/facts.embeddings.json';

describe('build-embeddings pipeline — local mode smoke', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-embeddings-smoke-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeFact(category: string, filename: string, content: string): void {
    const dir = path.join(tempDir, category);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), content, 'utf8');
  }

  it('produces a JSON bundle with the expected shape and normalised vectors', () => {
    writeFact('core', 'a.md', `---\nid: core-a\nanchor: true\ntags: [a]\npriority: 9\n---\n\nfact A body`);
    writeFact('projects', 'b.md', `---\nid: project-b\ntags: [b]\npriority: 5\n---\n\nfact B body`);

    const facts = loadFacts(tempDir);
    expect(facts).toHaveLength(2);

    const embedded: EmbeddedFact[] = facts.map((fact) => ({
      ...fact,
      embedding: l2Normalize(localEmbed(fact.text)),
      contentHash: hashContent(fact.text),
    }));

    const dimension = embedded[0].embedding.length;
    expect(dimension).toBe(LOCAL_EMBEDDING_DIMENSION);
    embedded.forEach((fact) => {
      expect(fact.embedding).toHaveLength(dimension);
      const sumSquares = fact.embedding.reduce((acc, value) => acc + value * value, 0);
      expect(sumSquares).toBeCloseTo(1);
    });

    const outBundle: EmbeddingsBundle = {
      model: LOCAL_EMBEDDING_MODEL_ID,
      dimension,
      generatedAt: new Date().toISOString(),
      factCount: embedded.length,
      facts: embedded,
    };

    const serialised = JSON.stringify(outBundle);
    const reparsed = JSON.parse(serialised) as EmbeddingsBundle;
    expect(reparsed.factCount).toBe(2);
    expect(reparsed.facts[0].id).toBeDefined();
    expect(reparsed.facts[0].contentHash).toHaveLength(64);
  });

  it('localEmbed + l2Normalize is deterministic across runs', () => {
    const first = l2Normalize(localEmbed('hello dhruv'));
    const second = l2Normalize(localEmbed('hello dhruv'));
    expect(first).toEqual(second);
  });

  it('different inputs produce different vectors', () => {
    const a = l2Normalize(localEmbed('cropio portrait cropper'));
    const b = l2Normalize(localEmbed('bloom filter research'));
    let dot = 0;
    for (let index = 0; index < a.length; index++) dot += a[index] * b[index];
    expect(dot).toBeLessThan(0.99);
  });
});

describe('committed facts.embeddings.json', () => {
  it('has the expected shape', () => {
    const typed = bundle as EmbeddingsBundle;
    expect(typed.model.length).toBeGreaterThan(0);
    expect(typed.dimension).toBeGreaterThan(0);
    expect(typed.factCount).toBe(typed.facts.length);
    expect(typed.factCount).toBeGreaterThan(0);
  });

  it('every fact has a non-zero, correctly-dimensioned embedding', () => {
    const typed = bundle as EmbeddingsBundle;
    const dimension = typed.dimension;
    for (const fact of typed.facts) {
      expect(fact.embedding).toHaveLength(dimension);
      expect(fact.contentHash).toHaveLength(64);
      const nonZero = fact.embedding.some((v) => v !== 0);
      expect(nonZero, `fact ${fact.id} has all-zero embedding`).toBe(true);
    }
  });

  it('bundles are sorted by id for determinism', () => {
    const typed = bundle as EmbeddingsBundle;
    const ids = typed.facts.map((f) => f.id);
    const sorted = [...ids].sort((l, r) => l.localeCompare(r));
    expect(ids).toEqual(sorted);
  });

  it('contains at least one anchor fact and one non-anchor fact', () => {
    const typed = bundle as EmbeddingsBundle;
    expect(typed.facts.some((f) => f.anchor)).toBe(true);
    expect(typed.facts.some((f) => !f.anchor)).toBe(true);
  });
});
