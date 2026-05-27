import { describe, expect, it } from 'vitest';

import { adaptTextForSpeech } from '@/lib/ttsPrompts';

describe('adaptTextForSpeech', () => {
  it('keeps visual names speakable without mutating source text elsewhere', () => {
    expect(adaptTextForSpeech('Dhruv Mishra uses Next.js and Node.js.')).toBe('Dhroove. Misshra. uses Next J S and Node J S.');
    expect(adaptTextForSpeech('Mishra built it.')).toBe('Misshra built it.');
  });

  it('removes markdown and expands symbol-heavy tech tokens', () => {
    expect(adaptTextForSpeech('- Try `C++` with an API call → fast')).toBe('Try C plus plus with an A P I call fast');
  });

  it('summarizes links instead of speaking full punctuation-heavy URLs', () => {
    expect(adaptTextForSpeech('See https://whoisdhruv.com/projects for more.')).toBe('See link to whoisdhruv.com for more.');
  });
});
