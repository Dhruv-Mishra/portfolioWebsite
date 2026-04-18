// lib/localEmbedding.ts — Deterministic offline embedding used when
// EMBEDDINGS_MODE=local. Isomorphic (no server-only), so the runtime
// retrieval module and the build script can share the same function.
//
// This is a simple character-n-gram + word-token hashed vector ("hashing
// trick") producing a 256-d integer vector. It enables end-to-end cosine
// similarity retrieval without any network access, at the cost of being
// lexical rather than semantic. Suitable for dev/CI; production builds
// should use the real API-backed mode.

import crypto from 'node:crypto';

export const LOCAL_EMBEDDING_MODEL_ID = 'local-hashed-ngram-v1';
export const LOCAL_EMBEDDING_DIMENSION = 256;
const LOCAL_NGRAM_RANGE: readonly number[] = [3, 4, 5];

function hashTokenToBucket(token: string, dimension: number): { bucket: number; sign: number } {
  const digest = crypto.createHash('sha1').update(token).digest();
  const value = digest.readUInt32BE(0);
  const bucket = value % dimension;
  const sign = (digest[4] & 1) === 0 ? 1 : -1;
  return { bucket, sign };
}

export function localEmbed(text: string): number[] {
  const vector = new Array<number>(LOCAL_EMBEDDING_DIMENSION).fill(0);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return vector;

  const tokens = normalized.split(' ');
  for (const token of tokens) {
    for (const n of LOCAL_NGRAM_RANGE) {
      if (token.length < n) continue;
      for (let index = 0; index <= token.length - n; index++) {
        const gram = token.slice(index, index + n);
        const { bucket, sign } = hashTokenToBucket(gram, LOCAL_EMBEDDING_DIMENSION);
        vector[bucket] += sign;
      }
    }
    const { bucket, sign } = hashTokenToBucket(`__w:${token}`, LOCAL_EMBEDDING_DIMENSION);
    vector[bucket] += sign * 2;
  }
  return vector;
}

/** L2-normalise a vector in place (returns a new array). */
export function l2Normalize(vector: readonly number[]): number[] {
  let sumSquares = 0;
  for (const value of vector) sumSquares += value * value;
  const magnitude = Math.sqrt(sumSquares);
  if (magnitude === 0) return [...vector];
  return vector.map((value) => value / magnitude);
}
