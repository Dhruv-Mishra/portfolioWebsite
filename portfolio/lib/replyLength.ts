// Per-turn reply length. Small local models fill whatever output budget they get,
// so the prompt hint and the max-token cap are derived from the same classification.

export type ReplyLength = 'brief' | 'standard' | 'detailed';

export const REPLY_TOKEN_CAP: Readonly<Record<ReplyLength, number>> = {
  brief: 80,
  standard: 160,
  detailed: 360,
};

export const REPLY_LENGTH_HINT: Readonly<Record<ReplyLength, string>> = {
  brief: 'Length for this reply: one short sentence.',
  standard: 'Length for this reply: 1-3 sentences, under 60 words.',
  detailed: 'Length for this reply: up to two short paragraphs, under 150 words.',
};

const GREETING_PATTERN = /^(hi+|hey+|hello+|yo+|sup|hola|namaste|howdy|good\s+(morning|afternoon|evening|night)|gm|gn|thanks?|thank you|ty|cool|nice|ok(ay)?|got it|cheers|bye+|see ya|later)[\s!.,~:)\-]*$/i;
const DETAIL_PATTERN = /\b(explain|elaborate|in detail|detailed|deep dive|walk me through|step by step|compare|comparison|differences?|pros and cons|tell me more|go deeper|break(?: it)? down)\b/i;

export function isPureGreeting(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.length > 0 && trimmed.length <= 40 && GREETING_PATTERN.test(trimmed);
}

export function classifyReplyLength(message: string): ReplyLength {
  if (isPureGreeting(message)) return 'brief';
  return DETAIL_PATTERN.test(message) ? 'detailed' : 'standard';
}
