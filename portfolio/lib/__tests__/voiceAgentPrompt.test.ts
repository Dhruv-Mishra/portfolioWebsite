import { describe, expect, it } from 'vitest';
import { SITE_TOOL_NAMES } from '@/lib/siteTools';
import { buildVoiceSystemInstruction } from '@/lib/voiceAgentPrompt';
import { VOICE_WELCOME_HINT } from '@/lib/voiceAgentProtocol';

describe('voice system instruction', () => {
  it('stays compact, names every tool, and includes the welcome hint', () => {
    const prompt = buildVoiceSystemInstruction();
    expect(prompt.length).toBeLessThan(4_000);
    expect(prompt).toContain(VOICE_WELCOME_HINT);
    for (const name of SITE_TOOL_NAMES) {
      expect(prompt).toContain(name);
    }
  });
});
