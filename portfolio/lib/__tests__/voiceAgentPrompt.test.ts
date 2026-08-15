import { describe, expect, it } from 'vitest';
import { buildVoiceSystemInstruction } from '@/lib/voiceAgentPrompt';
import { VOICE_WELCOME_HINT } from '@/lib/voiceAgentProtocol';

describe('voice system instruction', () => {
  it('stays compact, keeps the welcome hint, and omits the tool catalog dump', () => {
    const prompt = buildVoiceSystemInstruction();
    expect(prompt.length).toBeLessThan(2_000);
    expect(prompt).toContain(VOICE_WELCOME_HINT);
    expect(prompt).toContain('end_voice_session');
    expect(prompt).not.toMatch(/\nTools:/);
    expect(prompt).not.toContain('start_voice_session');
  });
});
