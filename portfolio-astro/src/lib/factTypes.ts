// lib/factTypes.ts — Shared types for the fact corpus and embeddings pipeline.
// Pure types; safe to import from both server and build-script contexts.
// NOTE: Do not import 'server-only' here — the build script runs in plain Node.

import type { ProjectSlug } from '@/lib/projectCatalog';

/** Category folder under content/facts/ */
export type FactCategory = 'core' | 'projects' | 'resume' | 'site' | 'personal';

/** Structured fact loaded from a markdown file. */
export interface Fact {
  /** Stable ID — must be globally unique across the corpus. */
  id: string;
  /** Markdown body (frontmatter stripped). */
  text: string;
  /** Lower-cased tag tokens used for legacy keyword fallback. */
  tags: readonly string[];
  /** Higher = more important; used as a tie-breaker during retrieval. */
  priority: number;
  /** Anchor facts are always included in the retrieved set. */
  anchor: boolean;
  /** Source category — matches the folder name under content/facts/. */
  category: FactCategory;
  /** Optional project slug linkage for project-info responses. */
  slug?: ProjectSlug;
}

/** A single fact with its precomputed dense embedding. */
export interface EmbeddedFact extends Fact {
  /** Normalized embedding vector (unit length) from the embedding model. */
  embedding: readonly number[];
  /** Content hash (sha256 of `text`) used to skip unchanged facts. */
  contentHash: string;
}

/** JSON blob committed to lib/facts.embeddings.json. */
export interface EmbeddingsBundle {
  /** Model id used to generate the embeddings (e.g. text-embedding-3-small). */
  model: string;
  /** Dimension of the embedding vectors (e.g. 1536). */
  dimension: number;
  /** Build timestamp in ISO-8601. */
  generatedAt: string;
  /** Total number of facts embedded. */
  factCount: number;
  /** Facts sorted by id for determinism. */
  facts: readonly EmbeddedFact[];
}
