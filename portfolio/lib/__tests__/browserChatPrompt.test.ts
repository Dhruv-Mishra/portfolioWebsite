import { describe, expect, it } from 'vitest';

import {
  buildBrowserChatMessages,
  selectBrowserChatFacts,
  type BrowserChatFact,
} from '@/lib/browserChatPrompt';
import { IDENTITY_BLOCK } from '@/lib/chatPromptBlocks';

const FACTS: BrowserChatFact[] = [
  { id: 'identity', text: 'I am Dhruv.', tags: ['identity'], priority: 10, anchor: true },
  { id: 'port-solace', text: 'Port Solace is a voxel game.', tags: ['port solace', 'voxel game'], priority: 10, anchor: false },
  { id: 'cropio', text: 'Cropio is an agritech app with a voxel-free UI.', tags: ['cropio'], priority: 5, anchor: false },
  { id: 'gym', text: 'I lift weights.', tags: ['gym'], priority: 1, anchor: false },
];

describe('browser chat prompt', () => {
  it('always keeps anchors and ranks tag matches above text matches', () => {
    expect(selectBrowserChatFacts(FACTS, 'tell me about the voxel game').map((fact) => fact.id))
      .toEqual(['identity', 'port-solace', 'cropio']);
  });

  it('returns only anchors when nothing matches', () => {
    expect(selectBrowserChatFacts(FACTS, 'hello there').map((fact) => fact.id)).toEqual(['identity']);
  });

  it('builds a persona system prompt with facts and bounded history', () => {
    const history = Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: index === 8 ? 'what is cropio?' : `turn ${index}`,
    }));
    const messages = buildBrowserChatMessages(FACTS, history);

    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain(IDENTITY_BLOCK);
    expect(messages[0].content).toContain('Cropio is an agritech app');
    expect(messages[0].content).not.toContain('I lift weights.');
    expect(messages.slice(1)).toEqual(history.slice(-6));
  });
});
