import {
  IDENTITY_BLOCK,
  NEVER_INVENT_BLOCK,
  OFF_TOPIC_BLOCK,
  STYLE_BLOCK,
} from '@/lib/chatPromptBlocks';
import type { Fact } from '@/lib/factTypes';
import { getFactFollowUpContext, rankFactsByQuery } from '@/lib/factRanking';
import { REPLY_LENGTH_HINT, classifyReplyLength } from '@/lib/replyLength';

export type BrowserChatFact = Pick<Fact, 'id' | 'text' | 'tags' | 'priority' | 'anchor'>;

export interface BrowserChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type BrowserChatPromptMessage = { role: 'system'; content: string } | BrowserChatTurn;

const RANKED_FACT_LIMIT = 3;
const HISTORY_LIMIT = 6;

export function selectBrowserChatFacts(
  facts: readonly BrowserChatFact[],
  query: string,
  limit = RANKED_FACT_LIMIT,
): BrowserChatFact[] {
  const anchors = facts.filter((fact) => fact.anchor);
  const ranked = rankFactsByQuery(facts, query)
    .filter(({ fact }) => !fact.anchor)
    .slice(0, limit)
    .map(({ fact }) => fact);

  return [...anchors, ...ranked];
}

export function buildBrowserChatMessages(
  facts: readonly BrowserChatFact[],
  history: readonly BrowserChatTurn[],
): BrowserChatPromptMessage[] {
  const recent = history.slice(-HISTORY_LIMIT);
  const userTurns = recent.filter((turn) => turn.role === 'user');
  const query = userTurns.at(-1)?.content ?? '';
  const followUpContext = getFactFollowUpContext(recent);
  const latestFacts = selectBrowserChatFacts(facts, query);
  const selected = followUpContext && !latestFacts.some((fact) => !fact.anchor)
    ? selectBrowserChatFacts(facts, `${followUpContext} ${query}`)
    : latestFacts;
  const factText = selected.map((fact) => fact.text.trim()).join('\n\n');
  const lengthHint = REPLY_LENGTH_HINT[classifyReplyLength(userTurns.at(-1)?.content ?? '')];
  const system = [IDENTITY_BLOCK, STYLE_BLOCK, NEVER_INVENT_BLOCK, OFF_TOPIC_BLOCK, `Relevant facts:\n${factText}`, lengthHint]
    .join('\n\n');

  return [{ role: 'system', content: system }, ...recent];
}
