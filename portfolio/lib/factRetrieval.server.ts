// lib/factRetrieval.server.ts — Runtime fact retrieval for the chat system.
//
// Responsibilities:
//   1. Load the build-time embeddings bundle (lib/facts.embeddings.json).
//   2. Pick topical facts for the latest message: a forced topic fact (named
//      project, PC specs, terminal), then lexical tag and rare-word matches.
//   3. Break equal lexical scores with query-embedding cosine similarity.
//   4. Always include anchors; degrade to lexical order if embedding fails.
//
// Bundle format assumptions are pinned in lib/factTypes.ts. If the file is
// missing or malformed we log once and return anchors only — never throw.
import 'server-only';

import OpenAI from 'openai';

import embeddingsBundle from '@/lib/facts.embeddings.json';
import { rankFactsByQuery } from '@/lib/factRanking';
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
  /** Earlier visitor turns, searched only when the query itself names no topic ("tell me more"). */
  followUpContext?: string;
}

const DEFAULT_LIMIT = 8;
const PC_BUILD_FACT_ID = 'personal-pc-build';
const PC_SPECS_QUERY_PATTERN = /\b(pc|desktop|rig|specs?|gpu|cpu|ram|hardware|overclock|overclocking|3080|13600kf|ddr5)\b|\bcomputer\b(?!\s+(?:science|vision|engineering))/i;
const TERMINAL_FACT_ID = 'site-terminal';
const TERMINAL_OVERVIEW_QUERY_PATTERN = /\b(terminal|cli)\b|\b(what|which|list|show|available|supported)\b(?:\W+\w+){0,3}\W+commands?\b/i;
const MATRIX_PUZZLE_FACT_ID = 'site-matrix-puzzle';
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

function findForcedFact(query: string): Fact | null {
  if (PC_SPECS_QUERY_PATTERN.test(query)) {
    return LOADED.facts.find((fact) => fact.id === PC_BUILD_FACT_ID) ?? null;
  }

  const projectMatches = PROJECT_ACTIONS.filter((project) =>
    project.keywords.some((keyword) => new RegExp(keyword, 'i').test(query))
      || new RegExp(`\\b${project.slug.replace(/-/g, '[-\\s]?')}\\b`, 'i').test(query),
  );
  if (projectMatches.length === 1) {
    return getFactBySlug(projectMatches[0].slug);
  }

  if (TERMINAL_OVERVIEW_QUERY_PATTERN.test(query) && !MATRIX_PUZZLE_QUERY_PATTERN.test(query)) {
    return LOADED.facts.find((fact) => fact.id === TERMINAL_FACT_ID) ?? null;
  }

  return null;
}

// A tag phrase or two specific words; a single rare word is too weak to beat a named topic or keep a follow-up's topic.
const STRONG_MATCH_SCORE = 2;

/** Non-anchor facts the query is about, best first, and whether any of them is a strong match. */
async function findTopicalFacts(
  query: string,
  options: RetrievalOptions,
  limit: number,
): Promise<{ facts: Fact[]; strong: boolean }> {
  const forced = findForcedFact(query);
  // The puzzle fact shares generic tags (terminal, stickers, sudo); it only helps once the visitor asks about the puzzle.
  const puzzleAllowed = MATRIX_PUZZLE_QUERY_PATTERN.test(query);
  const scored = rankFactsByQuery(LOADED.facts, query).filter(({ fact, score }) => (
    !fact.anchor
    && fact.id !== forced?.id
    && (puzzleAllowed || fact.id !== MATRIX_PUZZLE_FACT_ID)
    && (!forced || score >= STRONG_MATCH_SCORE)
  ));
  const slots = limit - (forced ? 1 : 0);

  // Equal lexical scores are common, so the query embedding decides which of them make the cut.
  if (slots > 0 && scored.length > slots) {
    const queryEmbedding = await embedQuery(query, options);
    if (queryEmbedding) {
      const similarity = new Map(scored.map(({ fact }) => [fact.id, cosineSimilarity(fact.embedding, queryEmbedding)]));
      scored.sort((left, right) => (
        right.score - left.score || similarity.get(right.fact.id)! - similarity.get(left.fact.id)!
      ));
    }
  }

  return {
    facts: [...(forced ? [forced] : []), ...scored.map(({ fact }) => fact)].slice(0, limit),
    strong: forced !== null || scored.some(({ score }) => score >= STRONG_MATCH_SCORE),
  };
}

/**
 * Main entry point — retrieve facts relevant to the visitor's latest message.
 * Topical facts (the forced topic fact, then lexical matches) come first and keep
 * at least one slot; anchors fill the rest unless `includeAnchors` is false. Earlier
 * turns join the query only when the latest message has no strong topic of its own.
 */
export async function retrieveRelevantFacts(
  query: string,
  options: RetrievalOptions = {},
): Promise<Fact[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (LOADED.facts.length === 0 || limit <= 0) return [];

  const anchors = options.includeAnchors === false
    ? []
    : partitionFacts(LOADED.facts).anchors.sort((left, right) => (
      right.priority - left.priority || left.id.localeCompare(right.id)
    ));
  const topicalLimit = Math.max(1, limit - anchors.length);
  let topical = await findTopicalFacts(query, options, topicalLimit);
  if (!topical.strong && options.followUpContext?.trim()) {
    topical = await findTopicalFacts(`${options.followUpContext} ${query}`, options, topicalLimit);
  }

  return [...new Map([...topical.facts, ...anchors].map((fact) => [fact.id, fact])).values()].slice(0, limit);
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

let anchorFactContext: { text: string; count: number } | null = null;

/** Anchor facts in their fixed retrieval order, formatted like {@link getRelevantFactContext}. */
export function getAnchorFactContext(): { text: string; count: number } {
  anchorFactContext ??= (() => {
    const anchors = partitionFacts(LOADED.facts).anchors.sort((left, right) => (
      right.priority - left.priority || left.id.localeCompare(right.id)
    ));
    return { text: anchors.map((fact) => `- ${fact.text}`).join('\n'), count: anchors.length };
  })();
  return anchorFactContext;
}

/** Lookup a fact by its project slug — powers chatActionRouter project-info replies. */
export function getFactBySlug(slug: ProjectSlug): Fact | null {
  for (const fact of LOADED.facts) {
    if (fact.slug === slug) return fact;
  }
  return null;
}
