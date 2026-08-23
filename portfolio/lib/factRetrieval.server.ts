// lib/factRetrieval.server.ts — Runtime fact retrieval for the chat system.
//
// Responsibilities:
//   1. Load the build-time embeddings bundle (lib/facts.embeddings.json).
//   2. Embed the user query against the same model at request time.
//   3. Rank non-anchor facts by cosine similarity; always include anchors.
//   4. Gracefully degrade to priority-ordered anchors if the embedding call fails.
//
// Performance goal: < 50ms p50 added to the chat request on top of whatever
// the embeddings API takes (typically 60-150ms for small inputs). The actual
// cosine-similarity pass is O(N * D), ~50 facts * 1536 dims * a float mul
// per iteration — microseconds on modern hardware.
//
// Bundle format assumptions are pinned in lib/factTypes.ts. If the file is
// missing or malformed we log once and return anchors only — never throw.
import 'server-only';

import OpenAI from 'openai';

import embeddingsBundle from '@/lib/facts.embeddings.json';
import type { EmbeddedFact, EmbeddingsBundle, Fact } from '@/lib/factTypes';
import { l2Normalize, LOCAL_EMBEDDING_MODEL_ID, localEmbed } from '@/lib/localEmbedding';
import { PROJECT_ACTIONS, type ProjectSlug } from '@/lib/projectCatalog';

// ── Bundle initialisation (one-time) ────────────────────────────────

function toEmbeddedFact(raw: unknown): EmbeddedFact | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Partial<EmbeddedFact>;
  if (
    typeof entry.id !== 'string'
    || typeof entry.text !== 'string'
    || !Array.isArray(entry.tags)
    || typeof entry.priority !== 'number'
    || typeof entry.anchor !== 'boolean'
    || typeof entry.category !== 'string'
    || !Array.isArray(entry.embedding)
  ) {
    return null;
  }
  return entry as EmbeddedFact;
}

interface LoadedBundle {
  readonly facts: readonly EmbeddedFact[];
  readonly model: string;
  readonly dimension: number;
}

function initBundle(): LoadedBundle {
  const bundle = embeddingsBundle as EmbeddingsBundle;
  if (!bundle || !Array.isArray(bundle.facts) || bundle.facts.length === 0) {
    console.warn('[factRetrieval] Embeddings bundle is empty — retrieval will fall back to anchors only.');
    return { facts: [], model: '', dimension: 0 };
  }
  const facts = bundle.facts.map(toEmbeddedFact).filter((fact): fact is EmbeddedFact => fact !== null);
  if (facts.length !== bundle.facts.length) {
    console.warn(`[factRetrieval] Dropped ${bundle.facts.length - facts.length} malformed entries from embeddings bundle.`);
  }
  return {
    facts,
    model: bundle.model,
    dimension: bundle.dimension,
  };
}

const LOADED = initBundle();

// ── Retrieval config ────────────────────────────────────────────────

export interface RetrievalOptions {
  /** Max total facts returned (anchor + top-K). Defaults to 8. */
  limit?: number;
  /** Pass an explicit OpenAI client — mostly used in tests. */
  client?: OpenAI;
  /** Override the model id (defaults to the bundle model). */
  model?: string;
  /** Prepend the four core anchors on the general path. Defaults to true. */
  includeAnchors?: boolean;
}

const DEFAULT_LIMIT = 8;
const PC_BUILD_FACT_ID = 'personal-pc-build';
const PC_SPECS_QUERY_PATTERN = /\b(pc|computer|desktop|rig|specs?|gpu|cpu|ram|memory|hardware|overclock|overclocking|3080|13600kf|ddr5)\b/i;
const COMMAND_PALETTE_FACT_ID = 'site-command-palette';
const COMMAND_PALETTE_QUERY_PATTERN = /\bcommand\s+palette\b|\b(?:cmd|ctrl)\s*\+\s*k\b/i;
const TERMINAL_FACT_ID = 'site-terminal';
const TERMINAL_OVERVIEW_QUERY_PATTERN = /\b(terminal|cli)\b|\b(what|which|list|show|available|supported)\b(?:\W+\w+){0,3}\W+commands?\b/i;
const MATRIX_PUZZLE_QUERY_PATTERN = /\b(matrix|puzzle|escape|stuck|hint)\b/i;

// ── Math helpers ────────────────────────────────────────────────────

/**
 * Cosine similarity assuming both vectors are already L2-normalised.
 * Build-embeddings writes normalised vectors; queryEmbedding also gets
 * normalised at runtime, so this reduces to a dot product.
 */
export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  for (let index = 0; index < left.length; index++) {
    dot += left[index] * right[index];
  }
  return dot;
}

function normalize(vector: readonly number[]): readonly number[] {
  return l2Normalize(vector);
}

/**
 * When the bundle was built with the local hashed-n-gram embedding, the
 * query must be embedded the same way or cosine similarity is meaningless.
 */
function isLocalBundle(): boolean {
  return LOADED.model === LOCAL_EMBEDDING_MODEL_ID;
}

// ── OpenAI client (lazy, cached) ────────────────────────────────────

let cachedClient: OpenAI | null = null;
let clientInitAttempted = false;

function getEmbeddingsClient(): OpenAI | null {
  if (cachedClient || clientInitAttempted) return cachedClient;
  clientInitAttempted = true;
  const apiKey = process.env.EMBEDDINGS_API_KEY ?? process.env.LLM_API_KEY;
  if (!apiKey) {
    console.warn('[factRetrieval] No API key available for embeddings — degraded to anchors only.');
    return null;
  }
  const baseURL = process.env.EMBEDDINGS_BASE_URL ?? process.env.LLM_BASE_URL;
  cachedClient = new OpenAI({ apiKey, baseURL, maxRetries: 0 });
  return cachedClient;
}

// ── Retrieval primitives ────────────────────────────────────────────

/** Separate the loaded corpus into anchor vs rankable lists. Exported for tests. */
export function partitionFacts(facts: readonly EmbeddedFact[]): {
  anchors: EmbeddedFact[];
  rankable: EmbeddedFact[];
} {
  const anchors: EmbeddedFact[] = [];
  const rankable: EmbeddedFact[] = [];
  for (const fact of facts) {
    if (fact.anchor) {
      anchors.push(fact);
    } else {
      rankable.push(fact);
    }
  }
  return { anchors, rankable };
}

/**
 * Rank facts against a query embedding. Returns the top-K (stable ordering:
 * cosine similarity descending, then priority descending, then id asc).
 */
export function topKByEmbedding(
  facts: readonly EmbeddedFact[],
  queryEmbedding: readonly number[],
  limit: number,
): EmbeddedFact[] {
  if (limit <= 0 || facts.length === 0) return [];
  const scored = facts.map((fact) => ({
    fact,
    score: cosineSimilarity(fact.embedding, queryEmbedding),
  }));
  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.fact.priority !== left.fact.priority) return right.fact.priority - left.fact.priority;
    return left.fact.id.localeCompare(right.fact.id);
  });
  return scored.slice(0, limit).map((entry) => entry.fact);
}

/** Fallback ordering: highest-priority non-anchor facts when embeddings fail. */
export function topKByPriority(
  facts: readonly EmbeddedFact[],
  limit: number,
): EmbeddedFact[] {
  if (limit <= 0) return [];
  return [...facts]
    .sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority;
      return left.id.localeCompare(right.id);
    })
    .slice(0, limit);
}

/** Call the embeddings API; returns null on any failure so callers can degrade. */
export async function embedQuery(query: string, options: RetrievalOptions = {}): Promise<readonly number[] | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  // When the bundle is the local hashed-ngram variant, skip the API entirely
  // and use the same deterministic hashing for the query. This keeps cosine
  // similarity meaningful in dev/CI mode.
  if (isLocalBundle()) {
    const vector = localEmbed(trimmed);
    if (vector.every((value) => value === 0)) return null;
    return normalize(vector);
  }

  // LRU cache: most repeat questions ("tell me about cropio", "what do you do")
  // hit the cache and skip the embeddings API call entirely. Keyed on the
  // lowercased trimmed query. Only consulted/populated when no custom client
  // or model override is supplied (so test injection is unaffected).
  const useCache = !options.client && !options.model;
  const cacheKey = trimmed.toLowerCase();
  if (useCache) {
    const hit = embedQueryCache.get(cacheKey);
    if (hit) return hit;
  }

  const client = options.client ?? getEmbeddingsClient();
  if (!client) return null;

  const model = options.model ?? LOADED.model;
  if (!model) return null;

  try {
    const response = await client.embeddings.create({
      model,
      input: trimmed,
      encoding_format: 'float',
    });
    const vector = response.data?.[0]?.embedding;
    if (!vector || vector.length === 0) return null;
    if (LOADED.dimension > 0 && vector.length !== LOADED.dimension) {
      console.warn(`[factRetrieval] Query embedding dimension ${vector.length} ≠ corpus ${LOADED.dimension}; discarding.`);
      return null;
    }
    const normalized = normalize(vector as number[]);
    if (useCache) embedQueryCache.set(cacheKey, normalized);
    return normalized;
  } catch (err) {
    console.warn('[factRetrieval] Embeddings API call failed; degrading to anchors-only.', err);
    return null;
  }
}

// ── Embedding query cache (LRU + TTL) ───────────────────────────────
//
// Caches normalized query-embedding vectors so repeat questions (which are
// the common case for a portfolio chatbot) skip the embeddings API call.
// Size 200 is plenty for the long tail of real questions; 1h TTL bounds
// staleness if the embeddings model id changes between deploys.

interface CacheEntry {
  value: readonly number[];
  expires: number;
}

const EMBED_CACHE_MAX = 200;
const EMBED_CACHE_TTL_MS = 60 * 60 * 1000;

const embedQueryCache = (() => {
  const store = new Map<string, CacheEntry>();
  return {
    get(key: string): readonly number[] | undefined {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expires <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      // Re-insert to mark as most-recently-used.
      store.delete(key);
      store.set(key, entry);
      return entry.value;
    },
    set(key: string, value: readonly number[]): void {
      if (store.has(key)) store.delete(key);
      store.set(key, { value, expires: Date.now() + EMBED_CACHE_TTL_MS });
      if (store.size > EMBED_CACHE_MAX) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
    },
  };
})();

async function fillFactsAfterForced(
  forced: Fact,
  query: string,
  options: RetrievalOptions,
  limit: number,
): Promise<Fact[]> {
  const remaining = Math.max(0, limit - 1);
  if (remaining === 0) return [forced];
  const { rankable } = partitionFacts(LOADED.facts);
  const pool = rankable.filter((fact) => fact.id !== forced.id);
  const queryEmbedding = await embedQuery(query, options);
  const ranked = queryEmbedding
    ? topKByEmbedding(pool, queryEmbedding, remaining)
    : topKByPriority(pool, remaining);
  return [forced, ...ranked].slice(0, limit);
}

/**
 * Main entry point — retrieve facts relevant to the user's last few messages.
 * Anchors are prepended in priority order unless `includeAnchors` is false,
 * then the top-K non-anchor facts fill the remaining slots.
 */
export async function retrieveRelevantFacts(
  query: string,
  options: RetrievalOptions = {},
): Promise<Fact[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const includeAnchors = options.includeAnchors !== false;
  if (LOADED.facts.length === 0) return [];

  if (PC_SPECS_QUERY_PATTERN.test(query)) {
    const pcFact = LOADED.facts.find((fact) => fact.id === PC_BUILD_FACT_ID);
    if (pcFact) return [pcFact];
  }

  const projectMatches = PROJECT_ACTIONS.filter((project) =>
    project.keywords.some((keyword) => new RegExp(keyword, 'i').test(query))
      || new RegExp(`\\b${project.slug.replace(/-/g, '[-\\s]?')}\\b`, 'i').test(query),
  );
  if (projectMatches.length === 1) {
    const projectFact = getFactBySlug(projectMatches[0].slug);
    if (projectFact) {
      if (includeAnchors) {
        const { anchors } = partitionFacts(LOADED.facts);
        const extras = anchors.filter((fact) => fact.id !== projectFact.id);
        return [projectFact, ...extras].slice(0, limit);
      }
      return fillFactsAfterForced(projectFact, query, options, limit);
    }
  }

  const { anchors, rankable } = partitionFacts(LOADED.facts);
  const anchorSlice = [...anchors].sort((left, right) => {
    if (right.priority !== left.priority) return right.priority - left.priority;
    return left.id.localeCompare(right.id);
  });

  if (COMMAND_PALETTE_QUERY_PATTERN.test(query)) {
    const commandPaletteFact = LOADED.facts.find((fact) => fact.id === COMMAND_PALETTE_FACT_ID);
    if (commandPaletteFact) {
      if (includeAnchors) return [...anchorSlice, commandPaletteFact].slice(0, limit);
      return fillFactsAfterForced(commandPaletteFact, query, options, limit);
    }
  }

  if (TERMINAL_OVERVIEW_QUERY_PATTERN.test(query) && !MATRIX_PUZZLE_QUERY_PATTERN.test(query)) {
    const terminalFact = LOADED.facts.find((fact) => fact.id === TERMINAL_FACT_ID);
    if (terminalFact) {
      if (includeAnchors) return [...anchorSlice, terminalFact].slice(0, limit);
      return fillFactsAfterForced(terminalFact, query, options, limit);
    }
  }

  const prepended = includeAnchors ? anchorSlice : [];
  const remaining = Math.max(0, limit - prepended.length);
  if (remaining === 0) {
    return prepended.slice(0, limit);
  }

  const queryEmbedding = await embedQuery(query, options);
  const ranked = queryEmbedding
    ? topKByEmbedding(rankable, queryEmbedding, remaining)
    : topKByPriority(rankable, remaining);

  const seen = new Set<string>();
  const out: Fact[] = [];
  for (const fact of [...prepended, ...ranked]) {
    if (seen.has(fact.id)) continue;
    seen.add(fact.id);
    out.push(fact);
    if (out.length >= limit) break;
  }
  return out;
}

/** Convenience wrapper: retrieve + format as a bulleted context block. */
export async function getRelevantFactContext(
  query: string,
  options: RetrievalOptions = {},
): Promise<string> {
  const facts = await retrieveRelevantFacts(query, options);
  if (facts.length === 0) return '';
  return facts.map((fact) => `- ${fact.text}`).join('\n');
}

/** Lookup a fact by its project slug — powers chatActionRouter project-info replies. */
export function getFactBySlug(slug: ProjectSlug): Fact | null {
  for (const fact of LOADED.facts) {
    if (fact.slug === slug) return fact;
  }
  return null;
}
