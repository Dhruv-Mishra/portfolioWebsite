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
import type { ProjectSlug } from '@/lib/projectCatalog';

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
}

const DEFAULT_LIMIT = 8;

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
    return normalize(vector as number[]);
  } catch (err) {
    console.warn('[factRetrieval] Embeddings API call failed; degrading to anchors-only.', err);
    return null;
  }
}

/**
 * Main entry point — retrieve facts relevant to the user's last few messages.
 * Always returns at least the anchor facts (when the bundle is present).
 * Anchors are prepended in priority order, then the top-K non-anchor facts.
 */
export async function retrieveRelevantFacts(
  query: string,
  options: RetrievalOptions = {},
): Promise<Fact[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (LOADED.facts.length === 0) return [];

  const { anchors, rankable } = partitionFacts(LOADED.facts);
  const anchorSlice = [...anchors].sort((left, right) => {
    if (right.priority !== left.priority) return right.priority - left.priority;
    return left.id.localeCompare(right.id);
  });

  const remaining = Math.max(0, limit - anchorSlice.length);
  if (remaining === 0) {
    return anchorSlice.slice(0, limit);
  }

  const queryEmbedding = await embedQuery(query, options);
  const ranked = queryEmbedding
    ? topKByEmbedding(rankable, queryEmbedding, remaining)
    : topKByPriority(rankable, remaining);

  const seen = new Set<string>();
  const out: Fact[] = [];
  for (const fact of [...anchorSlice, ...ranked]) {
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
