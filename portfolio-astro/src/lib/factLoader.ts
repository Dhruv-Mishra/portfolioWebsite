// lib/factLoader.ts — Parses markdown facts with YAML frontmatter from content/facts/.
// Used by scripts/build-embeddings.ts and by tests. No 'server-only' marker —
// this runs in plain Node during the prebuild. No third-party YAML dep:
// the frontmatter format is small and fixed, so we parse a minimal subset.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { isProjectSlug, type ProjectSlug } from '@/lib/projectCatalog';
import type { Fact, FactCategory } from '@/lib/factTypes';

const FACT_CATEGORIES: readonly FactCategory[] = ['core', 'projects', 'resume', 'site', 'personal'] as const;
const FACT_CATEGORY_SET = new Set<string>(FACT_CATEGORIES);

function isFactCategory(value: string): value is FactCategory {
  return FACT_CATEGORY_SET.has(value);
}

/** Parsed frontmatter as a bag of strings / arrays / booleans / numbers. */
type FrontmatterValue = string | number | boolean | readonly string[];
type Frontmatter = Readonly<Record<string, FrontmatterValue>>;

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function parseInlineArray(raw: string): readonly string[] {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    throw new Error(`Expected YAML inline array, got: ${raw}`);
  }
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];

  // Simple CSV split — our values never contain commas.
  return inner
    .split(',')
    .map((item) => stripQuotes(item))
    .filter((item) => item.length > 0);
}

function parseScalar(raw: string): FrontmatterValue {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    return parseInlineArray(trimmed);
  }
  if (trimmed === 'true' || trimmed === 'false') {
    return trimmed === 'true';
  }
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return stripQuotes(trimmed);
}

/**
 * Parse a minimal YAML frontmatter subset: `key: value` per line, where value
 * is a string, number, boolean, or inline array. No nested blocks, no anchors,
 * no folded scalars — our schema doesn't use them.
 */
export function parseFrontmatter(source: string): { frontmatter: Frontmatter; body: string } {
  if (!source.startsWith('---')) {
    throw new Error('Fact file must start with YAML frontmatter delimiter "---"');
  }

  const lines = source.split(/\r?\n/);
  const closeIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closeIndex < 0) {
    throw new Error('Fact file is missing the closing "---" delimiter');
  }

  const frontmatter: Record<string, FrontmatterValue> = {};
  for (let index = 1; index < closeIndex; index++) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex < 0) {
      throw new Error(`Invalid frontmatter line (missing colon): ${line}`);
    }
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1);
    if (!key) {
      throw new Error(`Invalid frontmatter line (empty key): ${line}`);
    }
    frontmatter[key] = parseScalar(value);
  }

  const body = lines.slice(closeIndex + 1).join('\n').trim();
  return { frontmatter, body };
}

/** sha256 of the fact body; used as the content hash for cache invalidation. */
export function hashContent(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function toProjectSlug(value: unknown): ProjectSlug | undefined {
  if (typeof value !== 'string') return undefined;
  return isProjectSlug(value) ? value : undefined;
}

function toTags(value: FrontmatterValue | undefined): readonly string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).toLowerCase().trim()).filter(Boolean);
  }
  return [String(value).toLowerCase().trim()].filter(Boolean);
}

function toPriority(value: FrontmatterValue | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toAnchor(value: FrontmatterValue | undefined): boolean {
  return value === true;
}

function toCategory(value: FrontmatterValue | undefined, fallback: FactCategory): FactCategory {
  if (typeof value === 'string' && isFactCategory(value)) {
    return value;
  }
  return fallback;
}

/**
 * Load all fact markdown files from `content/facts/`. The directory layout
 * is `content/facts/<category>/<slug>.md`. Category folder name wins over any
 * `category:` frontmatter value that disagrees, but frontmatter can pin an
 * explicit category for files that live outside their canonical folder.
 */
export function loadFacts(rootDir: string): Fact[] {
  const factsDir = path.resolve(rootDir);
  if (!fs.existsSync(factsDir)) {
    throw new Error(`Facts directory does not exist: ${factsDir}`);
  }

  const facts: Fact[] = [];
  const seenIds = new Set<string>();

  for (const categoryDirent of fs.readdirSync(factsDir, { withFileTypes: true })) {
    if (!categoryDirent.isDirectory()) continue;
    const categoryName = categoryDirent.name;
    if (!isFactCategory(categoryName)) {
      // Skip unknown folders rather than crash — keeps future-proofing easy.
      continue;
    }

    const categoryPath = path.join(factsDir, categoryName);
    const entries = fs.readdirSync(categoryPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      // Sort filenames for determinism across platforms.
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const filePath = path.join(categoryPath, entry.name);
      const raw = fs.readFileSync(filePath, 'utf8');
      const { frontmatter, body } = parseFrontmatter(raw);

      const id = typeof frontmatter.id === 'string' ? frontmatter.id : '';
      if (!id) {
        throw new Error(`Fact file is missing an "id" frontmatter field: ${filePath}`);
      }
      if (seenIds.has(id)) {
        throw new Error(`Duplicate fact id "${id}" — files must have unique ids. File: ${filePath}`);
      }
      if (!body) {
        throw new Error(`Fact file has an empty body: ${filePath}`);
      }

      seenIds.add(id);
      facts.push({
        id,
        text: body,
        tags: toTags(frontmatter.tags),
        priority: toPriority(frontmatter.priority),
        anchor: toAnchor(frontmatter.anchor),
        category: toCategory(frontmatter.category, categoryName),
        slug: toProjectSlug(frontmatter.slug),
      });
    }
  }

  // Final sort by id for deterministic output, regardless of folder traversal order.
  return facts.sort((left, right) => left.id.localeCompare(right.id));
}
