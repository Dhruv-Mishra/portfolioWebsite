import { describe, expect, it } from 'vitest';

import { finalizeAssistantReplyText } from '@/lib/chatSanitization';

describe('finalizeAssistantReplyText', () => {
  it('removes trailing tool artifacts before adding terminal punctuation', () => {
    expect(finalizeAssistantReplyText('Here is the answer\n{"name":"open_project_modal"}')).toBe('Here is the answer.');
  });

  it('removes a raw tool call the provider failed to parse', () => {
    expect(finalizeAssistantReplyText('Sure thing\n<tool_call>\n{"name": "navigate_to", "arguments": {"path": "/projects"}}\n</tool_call>')).toBe('Sure thing.');
  });

  it.each(['Already complete.', 'Really!', 'Why?', 'An ellipsis…', '~Open the project'])('preserves intentional terminal content: %s', (reply) => {
    expect(finalizeAssistantReplyText(reply)).toBe(reply);
  });
});