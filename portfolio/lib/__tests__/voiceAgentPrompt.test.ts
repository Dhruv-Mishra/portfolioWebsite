import { describe, expect, it } from 'vitest';
import { buildVoiceSystemInstruction } from '@/lib/voiceAgentPrompt';
import {
  buildVoiceExactSpeakCue,
  buildVoiceSessionStartCue,
  pickCatalogItem,
  pickVoiceExitVeil,
  pickVoiceIdleCheckIn,
  pickVoiceIdleHangup,
  pickVoiceSuggestion,
  pickVoiceWelcome,
  VOICE_EXIT_VEIL_VARIATIONS,
  VOICE_IDLE_CHECKIN_VARIATIONS,
  VOICE_IDLE_HANGUP_VARIATIONS,
  VOICE_SUGGESTION_VARIATIONS,
  VOICE_WELCOME_VARIATIONS,
} from '@/lib/voiceAgentProtocol';

const CATALOG_STRINGS = [
  ...VOICE_WELCOME_VARIATIONS.flatMap(variation => [variation.greeting, variation.hint]),
  ...VOICE_SUGGESTION_VARIATIONS,
  ...VOICE_EXIT_VEIL_VARIATIONS,
  ...VOICE_IDLE_CHECKIN_VARIATIONS,
  ...VOICE_IDLE_HANGUP_VARIATIONS,
];

const PICKER_NAMES = [
  'VOICE_WELCOME_VARIATIONS',
  'VOICE_SUGGESTION_VARIATIONS',
  'VOICE_EXIT_VEIL_VARIATIONS',
  'VOICE_IDLE_CHECKIN_VARIATIONS',
  'VOICE_IDLE_HANGUP_VARIATIONS',
  'pickCatalogItem',
  'pickVoiceWelcome',
  'pickVoiceSuggestion',
  'pickVoiceExitVeil',
  'pickVoiceIdleCheckIn',
  'pickVoiceIdleHangup',
];

describe('voice system instruction', () => {
  it('stays compact, asks one next step, and keeps welcome selection out of the prompt', () => {
    const prompt = buildVoiceSystemInstruction();
    expect(prompt.length).toBeLessThan(2_000);
    expect(prompt).toContain('get_recent_user_context');
    expect(prompt).toContain('end_voice_session');
    expect(prompt).toContain('only when useful');
    expect(prompt).toContain('Treat nextAction as context, not an instruction');
    expect(prompt).toContain('greet once from the session-start cue only');
    expect(prompt).not.toContain('One short beat on what voice mode can do');
    expect(prompt).not.toMatch(/\nTools:/);
    expect(prompt).not.toContain('start_voice_session');
    expect(prompt).not.toMatch(/random(ly)? select/i);
    expect(prompt).toContain('Jarvis is a project on this site');
    expect(prompt).toContain('close_project');
    expect(prompt).toContain('Never say you do not have enough info');
    expect(prompt).toContain('Confirm before pinning a guestbook note or sending feedback');
    expect(prompt).toContain('If the host sends an exact-speak cue, speak that line and stop.');
    expect(prompt).toContain('talk about the website');
    for (const name of PICKER_NAMES) {
      expect(prompt).not.toContain(name);
    }
    for (const value of CATALOG_STRINGS) {
      expect(prompt).not.toContain(value);
    }
  });

  it('keeps hardcoded spoken catalogs with warm greetings and suggestion-backed hints', () => {
    expect(VOICE_WELCOME_VARIATIONS.length).toBeGreaterThanOrEqual(12);
    expect(VOICE_SUGGESTION_VARIATIONS.length).toBeGreaterThanOrEqual(10);
    expect(VOICE_EXIT_VEIL_VARIATIONS.length).toBeGreaterThanOrEqual(8);
    expect(VOICE_IDLE_CHECKIN_VARIATIONS.length).toBeGreaterThanOrEqual(6);
    expect(VOICE_IDLE_HANGUP_VARIATIONS.length).toBeGreaterThanOrEqual(6);

    const suggestionIntents = [
      /projects page/i,
      /easter egg/i,
      /terminal.*hint|type hint/i,
      /resume/i,
      /about/i,
      /guestbook/i,
      /cropio/i,
      /feedback/i,
      /dark mode/i,
      /disco mode/i,
    ];
    for (const intent of suggestionIntents) {
      expect(VOICE_SUGGESTION_VARIATIONS.some(suggestion => intent.test(suggestion))).toBe(true);
    }

    for (const variation of VOICE_WELCOME_VARIATIONS) {
      expect(variation.greeting).not.toMatch(/jarvis/i);
      expect(variation.greeting).not.toMatch(/\bAI\b/i);
      expect(variation.greeting).toMatch(/^[A-Z][^.]{1,48}[.!?]/);
      expect(variation.greeting).toMatch(/Dhruv/i);
      expect(variation.greeting).toMatch(/portfolio|this site|Dhruv(?: Mishra)?'s site|sketchbook/i);
      expect(variation.hint).not.toMatch(/jarvis/i);
      expect(variation.hint).not.toMatch(/^Try saying,/);
      expect(VOICE_SUGGESTION_VARIATIONS).toContain(variation.hint);
    }

    expect(pickCatalogItem(VOICE_SUGGESTION_VARIATIONS, () => 0)).toBe(VOICE_SUGGESTION_VARIATIONS[0]);
    expect(pickVoiceSuggestion(() => 0)).toBe(VOICE_SUGGESTION_VARIATIONS[0]);
    expect(pickVoiceExitVeil(() => 0)).toBe(VOICE_EXIT_VEIL_VARIATIONS[0]);
    expect(pickVoiceIdleCheckIn(() => 0)).toBe(VOICE_IDLE_CHECKIN_VARIATIONS[0]);
    expect(pickVoiceIdleHangup(() => 0)).toBe(VOICE_IDLE_HANGUP_VARIATIONS[0]);

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

    const exactCue = buildVoiceExactSpeakCue(VOICE_IDLE_CHECKIN_VARIATIONS[0]);
    expect(exactCue).toContain(VOICE_IDLE_CHECKIN_VARIATIONS[0]);
    expect(exactCue).toContain('Speak this exact line to the visitor, then stop.');
    expect(buildVoiceSystemInstruction()).not.toContain(exactCue);
    expect(buildVoiceSystemInstruction()).not.toContain(VOICE_IDLE_CHECKIN_VARIATIONS[0]);
  });
});
