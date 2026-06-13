// lib/dhruvFacts.server.ts — Thin compat shim over the new fact retrieval pipeline.
//
// Historically this file hosted the hand-curated FACT_BANK plus a tag-scoring
// selector. Both are now replaced by:
//   - content/facts/** (markdown corpus)
//   - scripts/build-embeddings.ts (build-time embeddings)
//   - lib/factRetrieval.server.ts (runtime retrieval)
//
// The only public export still used is `getProjectFactText`, which is called
// synchronously by chatActionRouter to answer project-info questions. It now
// reads from the embedded corpus via getFactBySlug so the content stays in
// sync with the RAG index.
import 'server-only';

import { getFactBySlug } from '@/lib/factRetrieval.server';
import type { ProjectSlug } from '@/lib/projectCatalog';

export function getProjectFactText(slug: ProjectSlug): string | null {
  const fact = getFactBySlug(slug);
  return fact ? fact.text : null;
}
