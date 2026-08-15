import { describe, expect, it } from 'vitest';
import { buildVoiceSystemInstruction } from '@/lib/voiceAgentPrompt';
import {
  buildVoiceSessionStartCue,
  pickVoiceWelcome,
  VOICE_WELCOME_VARIATIONS,
} from '@/lib/voiceAgentProtocol';

describe('voice system instruction', () => {
  it('stays compact, asks one next step, and keeps welcome selection out of the prompt', () => {
    const prompt = buildVoiceSystemInstruction();
    expect(prompt.length).toBeLessThan(2_000);
    expect(prompt).toContain('end_voice_session');
    expect(prompt).toContain('contextually relevant next-step question');
    expect(prompt).not.toMatch(/\nTools:/);
    expect(prompt).not.toContain('start_voice_session');
    expect(prompt).not.toMatch(/random(ly)? select/i);
    expect(prompt).not.toContain('VOICE_WELCOME_VARIATIONS');
    expect(prompt).not.toContain('pickVoiceWelcome');
    expect(prompt).toContain('Jarvis is a project on this site');
    for (const variation of VOICE_WELCOME_VARIATIONS) {
      expect(prompt).not.toContain(variation.greeting);
      expect(prompt).not.toContain(variation.hint);
    }
  });

  it('keeps a 10+ first-visit catalog with executable hints and no Jarvis dead ends', () => {
    expect(VOICE_WELCOME_VARIATIONS.length).toBeGreaterThanOrEqual(10);
    for (const variation of VOICE_WELCOME_VARIATIONS) {
      expect(variation.greeting).not.toMatch(/jarvis/i);
      expect(variation.hint).not.toMatch(/jarvis/i);
      expect(variation.hint).not.toMatch(/try saying jarvis/i);
      expect(variation.hint).toMatch(/^Try saying,/);
    }
    const picked = pickVoiceWelcome(() => 0);
    expect(picked).toEqual(VOICE_WELCOME_VARIATIONS[0]);
    const cue = buildVoiceSessionStartCue({
      welcomeGreeting: picked.greeting,
      welcomeHint: picked.hint,
    });
    expect(cue).toContain(picked.greeting);
    expect(cue).toContain(picked.hint);
    expect(cue).not.toContain(VOICE_WELCOME_VARIATIONS[1].greeting);
    expect(cue).not.toMatch(/random/i);
    expect(buildVoiceSystemInstruction()).not.toContain(cue);
  });
});
