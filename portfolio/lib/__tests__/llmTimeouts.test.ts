import { describe, expect, it } from 'vitest';

import { CHAT_CONFIG } from '@/lib/chatContext';
import {
  LLM_CLIENT_TIMEOUT_MS,
  stripThinkTags,
  LLM_MAIN_RESPONSE_TIMEOUT_MS,
  LLM_PROVIDER_FALLBACK_RESERVE_MS,
  LLM_PROVIDER_TIMEOUT_MS,
  LLM_SUGGESTIONS_PROVIDER_TIMEOUT_MS,
  LLM_SUGGESTIONS_TIMEOUT_MS,
} from '@/lib/llmConfig';

describe('LLM timeout policy', () => {
  it('allows slow main vision requests without lengthening decorative suggestions', () => {
    expect(LLM_PROVIDER_TIMEOUT_MS).toBe(75_000);
    expect(LLM_MAIN_RESPONSE_TIMEOUT_MS).toBe(90_000);
    expect(LLM_PROVIDER_FALLBACK_RESERVE_MS).toBe(15_000);
    expect(LLM_CLIENT_TIMEOUT_MS).toBe(100_000);
    expect(CHAT_CONFIG.responseTimeoutMs).toBe(100_000);

    expect(LLM_SUGGESTIONS_PROVIDER_TIMEOUT_MS).toBe(4_500);
    expect(LLM_SUGGESTIONS_TIMEOUT_MS).toBe(7_000);
    expect(CHAT_CONFIG.suggestionsTimeoutMs).toBe(8_000);
  });
});

describe('reasoning sanitization', () => {
  it.each([
    ['<think>private</think>Answer', 'Answer'],
    ['Private draft</think>Answer', 'Answer'],
    ['Answer<think>unfinished private trace', 'Answer'],
    ['<think>unfinished private trace', ''],
    ['<THINK>private</THINK>Answer<THINK>unfinished', 'Answer'],
    ['An ordinary answer', 'An ordinary answer'],
  ])('sanitizes %s', (raw, expected) => {
    expect(stripThinkTags(raw)).toBe(expected);
  });
});
