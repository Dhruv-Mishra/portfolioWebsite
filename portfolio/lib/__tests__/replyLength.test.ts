import { describe, expect, it } from 'vitest';

import { classifyReplyLength, trimToLastSentence } from '@/lib/replyLength';

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

describe('trimToLastSentence', () => {
  it('keeps complete replies untouched', () => {
    expect(trimToLastSentence('Built it in a weekend. Still proud of it!')).toBe('Built it in a weekend. Still proud of it!');
  });

  it('drops a dangling fragment after the last sentence', () => {
    expect(trimToLastSentence('I work on Office. Mostly the shell and the')).toBe('I work on Office.');
  });

  it('keeps a single unfinished sentence rather than returning nothing', () => {
    const text = 'I spent two years building the realtime pipeline for';
    expect(trimToLastSentence(text)).toBe(text);
  });
});
