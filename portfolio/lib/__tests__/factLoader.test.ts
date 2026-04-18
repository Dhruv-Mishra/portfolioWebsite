import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { parseFrontmatter, hashContent, loadFacts } from '@/lib/factLoader';

describe('parseFrontmatter', () => {
  it('parses string, number, boolean, and inline array values', () => {
    const raw = `---
id: test-1
tags: [a, b, "c with space"]
priority: 7
anchor: true
---

body line 1
body line 2`;

    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter.id).toBe('test-1');
    expect(frontmatter.tags).toEqual(['a', 'b', 'c with space']);
    expect(frontmatter.priority).toBe(7);
    expect(frontmatter.anchor).toBe(true);
    expect(body).toBe('body line 1\nbody line 2');
  });

  it('throws on missing opening delimiter', () => {
    expect(() => parseFrontmatter('no frontmatter here')).toThrow(/must start with YAML/i);
  });

  it('throws on missing closing delimiter', () => {
    expect(() => parseFrontmatter('---\nid: foo\n')).toThrow(/missing the closing/i);
  });

  it('throws on malformed frontmatter line', () => {
    expect(() => parseFrontmatter('---\nbrokenline\n---\nbody')).toThrow(/missing colon/i);
  });

  it('preserves the body verbatim', () => {
    const raw = `---
id: x
---

Line with **markdown** and\n\ntwo blanks.`;
    const { body } = parseFrontmatter(raw);
    expect(body).toContain('**markdown**');
  });
});

describe('hashContent', () => {
  it('produces a stable sha256 hex digest', () => {
    expect(hashContent('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('is deterministic across identical inputs', () => {
    expect(hashContent('some fact body')).toBe(hashContent('some fact body'));
  });

  it('changes when input changes', () => {
    expect(hashContent('a')).not.toBe(hashContent('b'));
  });
});

describe('loadFacts', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fact-loader-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeFact(category: string, filename: string, content: string): void {
    const dir = path.join(tempDir, category);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), content, 'utf8');
  }

  it('loads facts from every supported category folder', () => {
    writeFact('core', 'alpha.md', `---\nid: core-alpha\ntags: [core]\npriority: 9\nanchor: true\n---\n\nalpha body`);
    writeFact('projects', 'beta.md', `---\nid: project-beta\ntags: [beta]\npriority: 3\n---\n\nbeta body`);
    writeFact('resume', 'gamma.md', `---\nid: resume-gamma\ntags: [gamma]\n---\n\ngamma body`);
    writeFact('site', 'delta.md', `---\nid: site-delta\ntags: []\npriority: 2\n---\n\ndelta body`);
    writeFact('personal', 'epsilon.md', `---\nid: personal-epsilon\ntags: [epsilon]\n---\n\nepsilon body`);

    const facts = loadFacts(tempDir);
    expect(facts).toHaveLength(5);
    // Deterministic sort by id.
    expect(facts.map((f) => f.id)).toEqual([
      'core-alpha',
      'personal-epsilon',
      'project-beta',
      'resume-gamma',
      'site-delta',
    ]);
    const alpha = facts.find((f) => f.id === 'core-alpha');
    expect(alpha).toMatchObject({ category: 'core', priority: 9, anchor: true, text: 'alpha body' });
  });

  it('throws on duplicate ids across files', () => {
    writeFact('core', 'one.md', `---\nid: dup\n---\n\nbody`);
    writeFact('core', 'two.md', `---\nid: dup\n---\n\nbody`);
    expect(() => loadFacts(tempDir)).toThrow(/Duplicate fact id/i);
  });

  it('throws when the facts directory is missing', () => {
    expect(() => loadFacts(path.join(tempDir, 'nope'))).toThrow(/does not exist/i);
  });

  it('throws when a fact file has no body', () => {
    writeFact('core', 'empty.md', `---\nid: empty\n---\n`);
    expect(() => loadFacts(tempDir)).toThrow(/empty body/i);
  });

  it('ignores unknown category folders', () => {
    writeFact('core', 'a.md', `---\nid: core-a\n---\n\nbody`);
    writeFact('unknown', 'b.md', `---\nid: unknown-b\n---\n\nbody`);
    const facts = loadFacts(tempDir);
    expect(facts.map((f) => f.id)).toEqual(['core-a']);
  });
});
