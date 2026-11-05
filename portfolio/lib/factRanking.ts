// Lexical fact ranking shared by server retrieval and the on-device chat prompt.
import type { Fact } from '@/lib/factTypes';

type RankableFact = Pick<Fact, 'id' | 'text' | 'tags' | 'priority'>;

interface CorpusIndex {
  tokens: Set<string>[];
  factCounts: Map<string, number>;
}

// A body word only counts when it is this specific to the corpus; common words ("work", "built") never qualify.
const RARE_TOKEN_MAX_FACTS = 3;
// Facts scoring below a third of the best match are dropped, so one stray word cannot pull in an unrelated fact.
const MIN_RELATIVE_SCORE = 1 / 3;

const STOP_WORDS = new Set([
  'about', 'after', 'all', 'also', 'and', 'any', 'are', 'been', 'but', 'can', 'could', 'did', 'does', 'doing', 'dont',
  'for', 'from', 'get', 'give', 'going', 'got', 'had', 'has', 'have', 'her', 'his', 'how', 'into', 'its', 'just', 'know',
  'let', 'like', 'look', 'made', 'make', 'many', 'more', 'most', 'much', 'not', 'now', 'one', 'our', 'out', 'over',
  'please', 'really', 'said', 'say', 'see', 'she', 'should', 'show', 'some', 'tell', 'than', 'thank', 'thanks', 'that',
  'the', 'their', 'them', 'then', 'there', 'these', 'they', 'thing', 'things', 'think', 'this', 'those', 'too', 'use',
  'used', 'using', 'very', 'want', 'was', 'way', 'well', 'were', 'what', 'whats', 'when', 'where', 'which', 'who', 'why',
  'will', 'with', 'would', 'yes', 'you', 'your', 'youre', 'yours',
]);

const corpusIndexes = new WeakMap<readonly RankableFact[], CorpusIndex>();

function toMatchText(text: string): string {
  return ` ${text.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9+#]+/g, ' ').trim()} `;
}

function stem(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function contentTokens(text: string): Set<string> {
  return new Set(toMatchText(text).trim().split(' ')
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .map(stem));
}

function getCorpusIndex(facts: readonly RankableFact[]): CorpusIndex {
  let index = corpusIndexes.get(facts);
  if (!index) {
    // Tags already match as whole phrases, so only body words feed the rare-word signal.
    const tokens = facts.map((fact) => contentTokens(fact.text));
    const factCounts = new Map<string, number>();
    for (const set of tokens) {
      for (const token of set) factCounts.set(token, (factCounts.get(token) ?? 0) + 1);
    }
    index = { tokens, factCounts };
    corpusIndexes.set(facts, index);
  }
  return index;
}

/**
 * Facts that match the query, best first. A curated tag phrase in the query scores its word count plus one;
 * each query word found in at most three facts scores one more.
 */
export function rankFactsByQuery<T extends RankableFact>(facts: readonly T[], query: string): Array<{ fact: T; score: number }> {
  const text = toMatchText(query);
  const queryTokens = contentTokens(query);
  const { tokens, factCounts } = getCorpusIndex(facts);

  const scored = facts.map((fact, index) => {
    let score = 0;
    for (const tag of fact.tags) {
      const phrase = toMatchText(tag).trim();
      if (phrase && (text.includes(` ${phrase} `) || text.includes(` ${phrase}s `))) {
        score += 1 + phrase.split(' ').length;
      }
    }
    for (const token of queryTokens) {
      if (tokens[index].has(token) && (factCounts.get(token) ?? 0) <= RARE_TOKEN_MAX_FACTS) score += 1;
    }
    return { fact, score };
  });

  const best = Math.max(0, ...scored.map((entry) => entry.score));
  return scored
    .filter((entry) => entry.score > 0 && entry.score >= best * MIN_RELATIVE_SCORE)
    .sort((left, right) => (
      right.score - left.score
      || right.fact.priority - left.fact.priority
      || left.fact.id.localeCompare(right.fact.id)
    ));
}
