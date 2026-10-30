import {
  IDENTITY_BLOCK,
  NEVER_INVENT_BLOCK,
  OFF_TOPIC_BLOCK,
  STYLE_BLOCK,
} from '@/lib/chatPromptBlocks';
import type { Fact } from '@/lib/factTypes';
import { REPLY_LENGTH_HINT, classifyReplyLength } from '@/lib/replyLength';

export type BrowserChatFact = Pick<Fact, 'id' | 'text' | 'tags' | 'priority' | 'anchor'>;

export interface BrowserChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type BrowserChatPromptMessage = { role: 'system'; content: string } | BrowserChatTurn;

const RANKED_FACT_LIMIT = 3;
const HISTORY_LIMIT = 6;
const QUERY_USER_TURNS = 2;
const TAG_MATCH_WEIGHT = 3;

const STOP_WORDS = new Set([
  'a', 'about', 'an', 'and', 'any', 'are', 'can', 'did', 'do', 'does', 'for', 'from', 'have', 'how',
  'is', 'it', 'me', 'my', 'of', 'on', 'or', 'tell', 'that', 'the', 'this', 'to', 'was', 'what',
  'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your',
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9+#]+/g) ?? [])
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function scoreFact(fact: BrowserChatFact, queryTokens: ReadonlySet<string>): number {
  const tagTokens = new Set(fact.tags.flatMap(tokenize));
  const textTokens = new Set(tokenize(fact.text));
  let score = 0;
  for (const token of queryTokens) {
    if (tagTokens.has(token)) score += TAG_MATCH_WEIGHT;
    else if (textTokens.has(token)) score += 1;
  }
  return score;
}

export function selectBrowserChatFacts(
  facts: readonly BrowserChatFact[],
  query: string,
  limit = RANKED_FACT_LIMIT,
): BrowserChatFact[] {
  const queryTokens = new Set(tokenize(query));
  const anchors = facts.filter((fact) => fact.anchor);
  const ranked = facts
    .filter((fact) => !fact.anchor)
    .map((fact) => ({ fact, score: scoreFact(fact, queryTokens) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => (
      right.score - left.score
      || right.fact.priority - left.fact.priority
      || left.fact.id.localeCompare(right.fact.id)
    ))
    .slice(0, limit)
    .map((entry) => entry.fact);

  return [...anchors, ...ranked];
}

export function buildBrowserChatMessages(
  facts: readonly BrowserChatFact[],
  history: readonly BrowserChatTurn[],
): BrowserChatPromptMessage[] {
  const recent = history.slice(-HISTORY_LIMIT);
  const userTurns = recent.filter((turn) => turn.role === 'user');
  const query = userTurns
    .slice(-QUERY_USER_TURNS)
    .map((turn) => turn.content)
    .join(' ');
  const factText = selectBrowserChatFacts(facts, query).map((fact) => fact.text.trim()).join('\n\n');
  const lengthHint = REPLY_LENGTH_HINT[classifyReplyLength(userTurns.at(-1)?.content ?? '')];
  const system = [IDENTITY_BLOCK, STYLE_BLOCK, NEVER_INVENT_BLOCK, OFF_TOPIC_BLOCK, `Relevant facts:\n${factText}`, lengthHint]
    .join('\n\n');

  return [{ role: 'system', content: system }, ...recent];
}
