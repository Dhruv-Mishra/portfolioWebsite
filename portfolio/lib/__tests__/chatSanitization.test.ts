import { describe, expect, it } from 'vitest';

import { finalizeAssistantReplyText } from '@/lib/chatSanitization';

describe('finalizeAssistantReplyText', () => {
  it('removes trailing tool artifacts before adding terminal punctuation', () => {
    expect(finalizeAssistantReplyText('Here is the answer\n{"name":"open_project_modal"}')).toBe('Here is the answer.');
  });

  it.each(['Already complete.', 'Really!', 'Why?', 'An ellipsis…', '~Open the project'])('preserves intentional terminal content: %s', (reply) => {
    expect(finalizeAssistantReplyText(reply)).toBe(reply);
  });
});