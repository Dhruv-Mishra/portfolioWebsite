import { describe, expect, it } from 'vitest';

import { adaptTextForKokoroTts } from '@/lib/ttsPrompts';

describe('adaptTextForKokoroTts', () => {
  it('keeps visual names speakable without mutating source text elsewhere', () => {
    expect(adaptTextForKokoroTts('Dhruv uses Next.js and Node.js.')).toBe('Dhroov uses Next J S and Node J S.');
  });

  it('removes markdown and expands symbol-heavy tech tokens', () => {
    expect(adaptTextForKokoroTts('- Try `C++` with an API call → fast')).toBe('Try C plus plus with an A P I call fast');
  });

  it('summarizes links instead of speaking full punctuation-heavy URLs', () => {
    expect(adaptTextForKokoroTts('See https://whoisdhruv.com/projects for more.')).toBe('See link to whoisdhruv.com for more.');
  });
});
