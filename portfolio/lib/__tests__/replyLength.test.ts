import { describe, expect, it } from 'vitest';

import { classifyReplyLength } from '@/lib/replyLength';

describe('classifyReplyLength', () => {
  it.each([
    ['hey!', 'brief'],
    ['thanks', 'brief'],
    ['what do you work on?', 'standard'],
    ['hey, what stack do you use at work?', 'standard'],
    ['explain how the chat retrieval works', 'detailed'],
    ['compare Cropio and Jarvis', 'detailed'],
    ['tell me more about Microsoft', 'detailed'],
  ] as const)('%s -> %s', (message, expected) => {
    expect(classifyReplyLength(message)).toBe(expected);
  });
});
