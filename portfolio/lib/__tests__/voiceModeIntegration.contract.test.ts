import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('voice mode integration contract', () => {
  it('keeps every requested entry point and fillable field wired to voice mode', () => {
    const settings = read('components/SettingsPanel.tsx');
    const commandRegistry = read('lib/commandRegistry.ts');
    const chat = read('components/StickyNoteChat.tsx');
    const guestbook = read('components/GuestbookForm.tsx');
    const feedback = read('components/FeedbackNote.tsx');
    const palette = read('components/CommandPalette.tsx');
    const terminal = read('components/Terminal.tsx');

    expect(settings).toContain('title="Voice Agent"');
    expect(commandRegistry).toContain('action-enter-voice-mode');
    expect(commandRegistry).toContain("label: 'Enter voice mode'");
    expect(chat).toContain('Enter native voice mode');
    expect(chat).toContain('data-voice-field="chat-composer"');
    expect(guestbook).toContain('data-voice-field="guestbook-message"');
    expect(guestbook).toContain('data-voice-field="guestbook-name"');
    expect(feedback).toContain('data-voice-field="feedback-message"');
    expect(feedback).toContain('data-voice-field="feedback-contact"');
    expect(palette).toContain('data-voice-field="command-palette-query"');
    expect(terminal).toContain('data-voice-field={activePrompt ? undefined : "terminal-input"}');
  });

  it('mounts the voice controller, keeps chat on exit, and styles voice mode chrome', () => {
    const enhancements = read('components/EagerEnhancements.tsx');
    const controller = read('components/voice/VoiceModeController.tsx');
    const stage = read('components/voice/VoiceStage.tsx');
    const home = read('app/page.tsx');
    const homeNote = read('components/voice/HomeVoiceNote.tsx');
    const store = read('lib/voiceModeStore.ts');
    const css = read('app/globals.css');

    expect(enhancements).toContain('VoiceModeController');
    expect(controller).not.toContain("href: '/chat'");
    expect(stage).not.toContain("href: '/'");
    expect(stage).toContain("role={intro ? 'dialog' : 'complementary'}");
    expect(stage).toContain('aria-label="Voice agent"');
    expect(home).toContain('HomeVoiceNote');
    expect(homeNote).toContain('Talk to me');
    expect(homeNote).toContain('Talk with Dhruv by voice');
    expect(homeNote).not.toContain('href=');
    expect(store).toMatch(/requested = null;\s+emit\(\);/);
    expect(css).toContain('html[data-voice-mode]');
    expect(css).toContain('html[data-voice-mode="intro"]');
    expect(css).toContain('.voice-orb-core');
    expect(css).toContain('voice-orb-speak');
    expect(css).toContain('html[data-motion="reduced"] .voice-orb-ring');
  });
});