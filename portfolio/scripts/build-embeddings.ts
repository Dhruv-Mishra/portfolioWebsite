// scripts/build-embeddings.ts — Build-time embedding generator.
// Walks content/facts/, calls the configured embeddings endpoint, and writes
// lib/facts.embeddings.json. Idempotent: facts whose content hash matches the
// previous bundle are reused without hitting the API.
//
// Invocation: `npm run build:embeddings` (or automatically via `prebuild`).
<<<<<<< Updated upstream
// Gate: set SKIP_EMBEDDINGS_BUILD=1 to skip — the committed JSON is used as-is.
//
// Env resolution (first available wins):
//   EMBEDDINGS_API_KEY / EMBEDDINGS_BASE_URL / EMBEDDINGS_MODEL
//     -> LLM_API_KEY / LLM_BASE_URL (+ text-embedding-3-small as default model)
//
// Local fallback mode: set EMBEDDINGS_MODE=local to generate deterministic
// hashed-n-gram embeddings without hitting any network. Produces a real,
// cosine-similar vector per fact — useful in CI and in dev environments
// without an API key. NEVER use this mode in production if you want
// semantic (as opposed to lexical) retrieval; it matches on shared character
// n-grams only. This mode still exercises the full pipeline end-to-end.
=======
//
// Resolution order (first applicable wins):
//   1. SKIP_EMBEDDINGS_BUILD=1    -> reuse committed bundle and exit
//   2. EMBEDDINGS_MODE=local      -> deterministic hashed-n-gram embeddings
//   3. EMBEDDINGS_API_KEY / LLM_API_KEY present -> real API embeddings
//   4. Neither set, committed bundle exists     -> auto-reuse (warn)
//   5. Neither set, no committed bundle         -> error
//
// Env vars for API mode:
//   EMBEDDINGS_API_KEY / EMBEDDINGS_BASE_URL / EMBEDDINGS_MODEL
//     -> LLM_API_KEY / LLM_BASE_URL (+ text-embedding-3-small default model)
//
// Auto-reuse (#4) is the safety net for production deploys: the committed
// `lib/facts.embeddings.json` is the source of truth in git, so a deploy
// without any embedding config just ships whatever was last committed.
//
// Local mode (#2) produces lexical rather than semantic vectors — it matches
// on shared character n-grams only. Fine for dev/CI and offline correctness
// tests, not equivalent to the API for production retrieval quality.
>>>>>>> Stashed changes

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';

import { hashContent, loadFacts } from '@/lib/factLoader';
import type { EmbeddedFact, EmbeddingsBundle, Fact } from '@/lib/factTypes';
import { LOCAL_EMBEDDING_MODEL_ID, localEmbed } from '@/lib/localEmbedding';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const FACTS_DIR = path.resolve(PROJECT_ROOT, 'content', 'facts');
const OUTPUT_PATH = path.resolve(PROJECT_ROOT, 'lib', 'facts.embeddings.json');
const DEFAULT_MODEL = 'text-embedding-3-small';

type EmbeddingsMode = 'api' | 'local';

interface EmbeddingsConfig {
  mode: EmbeddingsMode;
  apiKey: string | null;
  baseURL: string | undefined;
  model: string;
}

function resolveConfig(): EmbeddingsConfig {
  if (process.env.EMBEDDINGS_MODE === 'local') {
    return {
      mode: 'local',
      apiKey: null,
      baseURL: undefined,
      model: LOCAL_EMBEDDING_MODEL_ID,
    };
  }

  const apiKey = process.env.EMBEDDINGS_API_KEY ?? process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error(
      '[build-embeddings] Missing API key. Set EMBEDDINGS_API_KEY (preferred for OpenAI) '
      + 'or LLM_API_KEY. If the primary LLM endpoint does not expose embeddings, provide '
      + 'EMBEDDINGS_API_KEY/EMBEDDINGS_BASE_URL pointing at an OpenAI-compatible embeddings '
      + 'provider. You can also set SKIP_EMBEDDINGS_BUILD=1 to reuse the committed '
      + 'lib/facts.embeddings.json, or EMBEDDINGS_MODE=local for deterministic hashed '
      + 'embeddings (dev/CI only — not semantically equivalent to the API).',
    );
  }

  const baseURL = process.env.EMBEDDINGS_BASE_URL ?? process.env.LLM_BASE_URL ?? undefined;
  const model = process.env.EMBEDDINGS_MODEL ?? DEFAULT_MODEL;

  return { mode: 'api', apiKey, baseURL, model };
}

// Local hashed-n-gram embeddings now live in lib/localEmbedding.ts so they
// can be shared with factRetrieval.server.ts at runtime.

function loadExistingBundle(): EmbeddingsBundle | null {
  if (!fs.existsSync(OUTPUT_PATH)) return null;
  try {
    const raw = fs.readFileSync(OUTPUT_PATH, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed
      && typeof parsed === 'object'
      && 'facts' in parsed
      && Array.isArray((parsed as { facts: unknown }).facts)
    ) {
      return parsed as EmbeddingsBundle;
    }
  } catch (err) {
    console.warn('[build-embeddings] Existing bundle is unreadable — regenerating from scratch.', err);
  }
  return null;
}

function normalize(vector: readonly number[]): readonly number[] {
  let sumSquares = 0;
  for (const value of vector) {
    sumSquares += value * value;
  }
  const magnitude = Math.sqrt(sumSquares);
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

async function embedBatch(client: OpenAI, model: string, inputs: readonly string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const response = await client.embeddings.create({
    model,
    input: inputs as string[],
    encoding_format: 'float',
  });

  if (!response.data || response.data.length !== inputs.length) {
    throw new Error(
      `[build-embeddings] API returned ${response.data?.length ?? 0} embeddings for ${inputs.length} inputs`,
    );
  }

  return response.data.map((entry) => entry.embedding as number[]);
}

async function main(): Promise<void> {
  if (process.env.SKIP_EMBEDDINGS_BUILD === '1') {
    if (fs.existsSync(OUTPUT_PATH)) {
      console.log(`[build-embeddings] SKIP_EMBEDDINGS_BUILD=1 set — using existing ${path.relative(PROJECT_ROOT, OUTPUT_PATH)}.`);
      return;
    }
    console.warn('[build-embeddings] SKIP_EMBEDDINGS_BUILD=1 but no embeddings file exists. Writing empty bundle.');
    const emptyBundle: EmbeddingsBundle = {
      model: 'none',
      dimension: 0,
      generatedAt: new Date().toISOString(),
      factCount: 0,
      facts: [],
    };
    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(emptyBundle, null, 2)}\n`, 'utf8');
    return;
  }

<<<<<<< Updated upstream
=======
  // Auto-reuse fallback for deploys that don't configure embeddings. The
  // committed bundle is the source of truth in git; if nobody asked us to
  // regenerate and nothing's configured, just ship what's there.
  const hasApiKey = !!(process.env.EMBEDDINGS_API_KEY ?? process.env.LLM_API_KEY);
  const hasLocalMode = process.env.EMBEDDINGS_MODE === 'local';
  if (!hasApiKey && !hasLocalMode) {
    if (fs.existsSync(OUTPUT_PATH)) {
      console.warn(
        `[build-embeddings] No EMBEDDINGS_API_KEY / LLM_API_KEY / EMBEDDINGS_MODE=local — reusing committed `
        + `${path.relative(PROJECT_ROOT, OUTPUT_PATH)}. Set EMBEDDINGS_MODE=local to regenerate offline, `
        + `or provide an API key for semantic embeddings.`,
      );
      return;
    }
    // No config and no committed bundle — genuinely can't build. Fall through
    // to resolveConfig() so the error message is consistent.
  }

>>>>>>> Stashed changes
  const config = resolveConfig();
  console.log(
    `[build-embeddings] Mode: ${config.mode}; model "${config.model}"${config.baseURL ? ` @ ${config.baseURL}` : ''}`,
  );

  const facts = loadFacts(FACTS_DIR);
  console.log(`[build-embeddings] Loaded ${facts.length} facts from ${path.relative(PROJECT_ROOT, FACTS_DIR)}`);

  const existing = loadExistingBundle();
  const reusable = new Map<string, EmbeddedFact>();
  if (existing && existing.model === config.model) {
    for (const entry of existing.facts) {
      reusable.set(`${entry.id}::${entry.contentHash}`, entry);
    }
  }

  const freshFacts: Fact[] = [];
  const reusedEmbeddings = new Map<string, EmbeddedFact>();
  for (const fact of facts) {
    const hash = hashContent(fact.text);
    const cached = reusable.get(`${fact.id}::${hash}`);
    if (cached && Array.isArray(cached.embedding) && cached.embedding.length > 0) {
      reusedEmbeddings.set(fact.id, { ...cached, ...fact, contentHash: hash });
    } else {
      freshFacts.push(fact);
    }
  }

  console.log(
    `[build-embeddings] Reusing ${reusedEmbeddings.size} cached embeddings, generating ${freshFacts.length} fresh.`,
  );

  const freshEmbedded: EmbeddedFact[] = [];

  if (config.mode === 'local') {
    for (const fact of freshFacts) {
      const embedding = normalize(localEmbed(fact.text));
      freshEmbedded.push({
        ...fact,
        embedding,
        contentHash: hashContent(fact.text),
      });
    }
    console.log(`[build-embeddings] Local mode: embedded ${freshEmbedded.length} facts deterministically.`);
  } else {
    if (!config.apiKey) {
      throw new Error('[build-embeddings] API mode requires an API key (internal error).');
    }
    const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
    const BATCH_SIZE = 16;
    for (let index = 0; index < freshFacts.length; index += BATCH_SIZE) {
      const batch = freshFacts.slice(index, index + BATCH_SIZE);
      const inputs = batch.map((fact) => fact.text);
      process.stdout.write(`[build-embeddings] Batch ${Math.floor(index / BATCH_SIZE) + 1}: ${batch.length} facts... `);
      const vectors = await embedBatch(client, config.model, inputs);
      for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
        const fact = batch[batchIndex];
        const embedding = normalize(vectors[batchIndex]);
        freshEmbedded.push({
          ...fact,
          embedding,
          contentHash: hashContent(fact.text),
        });
      }
      console.log('ok');
    }
  }

  const allEmbedded: EmbeddedFact[] = [...reusedEmbeddings.values(), ...freshEmbedded]
    .sort((left, right) => left.id.localeCompare(right.id));

  if (allEmbedded.length === 0) {
    throw new Error('[build-embeddings] No facts were embedded. Is content/facts/ empty?');
  }

  const dimension = allEmbedded[0].embedding.length;
  if (!allEmbedded.every((fact) => fact.embedding.length === dimension)) {
    throw new Error('[build-embeddings] Embeddings have mismatched dimensions — check the embeddings model.');
  }

  const bundle: EmbeddingsBundle = {
    model: config.model,
    dimension,
    generatedAt: new Date().toISOString(),
    factCount: allEmbedded.length,
    facts: allEmbedded,
  };

  // Sort fact keys deterministically inside each object by reserializing.
  const stableJson = JSON.stringify(bundle, (_key, value) => value, 2);
  fs.writeFileSync(OUTPUT_PATH, `${stableJson}\n`, 'utf8');
  console.log(`[build-embeddings] Wrote ${allEmbedded.length} embeddings (${dimension} dims) to ${path.relative(PROJECT_ROOT, OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error('[build-embeddings] Failed.');
  console.error(err);
  process.exitCode = 1;
});
