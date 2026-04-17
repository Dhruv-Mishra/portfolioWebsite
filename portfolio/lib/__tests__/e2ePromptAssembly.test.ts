// Integration-flavoured test that exercises the full prompt pipeline
// end-to-end: retrieval (against the committed embeddings bundle) plus
// conditional block assembly. No stubs — what runs in this test is the
// same code path that runs inside /api/chat.
import { describe, it, expect } from 'vitest';

import { buildDhruvSystemPrompt, PROMPT_BLOCKS_FOR_TESTING } from '@/lib/chatContext.server';

describe('end-to-end system prompt assembly', () => {
  it('returns a prompt that includes real facts retrieved from the bundle', async () => {
    const prompt = await buildDhruvSystemPrompt([
      { role: 'user', content: 'tell me about cropio' },
    ]);
    expect(prompt).toContain('Relevant facts:');
    // cropio fact text should be pulled in via semantic/lexical retrieval.
    expect(prompt).toMatch(/Cropio/i);
  });

  it('simple "hi" prompt is meaningfully shorter than a heavy-signal prompt', async () => {
    const simple = await buildDhruvSystemPrompt([{ role: 'user', content: 'hi' }]);
    const heavy = await buildDhruvSystemPrompt([
      { role: 'user', content: 'open my github, toggle dark mode, what terminal commands exist, also politics' },
    ]);
    expect(heavy.length).toBeGreaterThan(simple.length);

    // Simple must be missing the 3 optional blocks:
    expect(simple).not.toContain(PROMPT_BLOCKS_FOR_TESTING.OFF_TOPIC_BLOCK);
    expect(simple).not.toContain(PROMPT_BLOCKS_FOR_TESTING.UI_ACTION_BLOCK);
    expect(simple).not.toContain(PROMPT_BLOCKS_FOR_TESTING.TERMINAL_RULES_BLOCK);

    // Heavy must include all three:
    expect(heavy).toContain(PROMPT_BLOCKS_FOR_TESTING.OFF_TOPIC_BLOCK);
    expect(heavy).toContain(PROMPT_BLOCKS_FOR_TESTING.UI_ACTION_BLOCK);
    expect(heavy).toContain(PROMPT_BLOCKS_FOR_TESTING.TERMINAL_RULES_BLOCK);
  });

  it('measurable token-count delta (character proxy) between baseline and heavy', async () => {
    const simple = await buildDhruvSystemPrompt([{ role: 'user', content: 'hi' }]);
    const heavy = await buildDhruvSystemPrompt([
      { role: 'user', content: 'open github, toggle dark mode, terminal commands, politics' },
    ]);
    // The three conditional blocks add ~hundreds of characters combined.
    const delta = heavy.length - simple.length;
    expect(delta).toBeGreaterThan(400);
  });
});
