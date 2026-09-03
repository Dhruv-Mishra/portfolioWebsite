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
    expect(chat).toContain("requestVoiceMode({ source: 'chat', topic: 'chat' })");
    expect(chat).toContain('data-voice-field="chat-composer"');
    expect(guestbook).toContain('data-voice-field="guestbook-message"');
    expect(guestbook).toContain('data-voice-field="guestbook-name"');
    expect(guestbook).toContain("registerSiteActionHost('guestbook')");
    expect(guestbook).toContain('SUBMIT_GUESTBOOK_EVENT');
    expect(feedback).toContain('data-voice-field="feedback-message"');
    expect(feedback).toContain('data-voice-field="feedback-contact"');
    expect(feedback).toContain("registerSiteActionHost('feedback')");
    expect(feedback).toContain('SUBMIT_FEEDBACK_EVENT');
    expect(palette).toContain('data-voice-field="command-palette-query"');
    expect(terminal).toContain('data-voice-field={activePrompt ? undefined : "terminal-input"}');
  });

  it('mounts the voice controller, keeps chat on exit, and styles voice mode chrome', () => {
    const enhancements = read('components/EagerEnhancements.tsx');
    const controller = read('components/voice/VoiceModeController.tsx');
    const stage = read('components/voice/VoiceStage.tsx');
    const orb = read('components/voice/VoiceOrb.tsx');
    const home = read('app/page.tsx');
    const homeNote = read('components/voice/HomeVoiceNote.tsx');
    const store = read('lib/voiceModeStore.ts');
    const css = read('app/globals.css');

    expect(enhancements).toContain('VoiceModeController');
    expect(controller).not.toMatch(/from ['"]@\/lib\/voiceSessionRuntime['"]/);
    expect(controller).toContain("import('@/lib/voiceSessionRuntime')");
    expect(controller).toContain('runtimeImport = null');
    expect(controller).not.toContain("href: '/chat'");
    expect(stage).not.toContain("href: '/'");
    expect(stage).toContain("role={intro || exiting ? 'dialog' : 'complementary'}");
    expect(stage).toContain('aria-label="Voice agent"');
    expect(home).toContain('HomeVoiceNote');
    expect(homeNote).toContain('Talk to me');
    expect(homeNote).toContain('Talk with Dhruv by voice');
    expect(homeNote).not.toContain('href=');
    expect(store).toMatch(/requested = null;\s+emit\(\);/);
    expect(store).toContain("import { disposePrimedVoiceAudio, primeVoiceEnterAudio } from '@/lib/voiceAudioActivation'");
    expect(store).toContain("import { playVoiceToggle, primeVoiceSounds, startVoiceAmbient } from '@/lib/voiceSounds'");
    expect(store).toMatch(
      /export function requestVoiceMode\([^)]*\)(?:: void)? \{\s+primeVoiceEnterAudio\(\);\s*primeVoiceSounds\(\);\s*playVoiceToggle\(startVoiceAmbient\);[\s\S]*emit\(\);/,
    );
    expect(store).toMatch(
      /export function requestVoiceModeExit\([^)]*\)(?:: void)? \{\s+disposePrimedVoiceAudio\(\);[\s\S]*emit\(\);/,
    );
    expect(homeNote).toContain("from '@/lib/voiceModeStore'");
    expect(homeNote).not.toMatch(/import\(['"]@\/lib\/voiceModeStore['"]\)/);
    expect(css).toContain('.voice-stage-veil');
    expect(css).toContain('html:not([data-motion="full"]) .voice-stage-veil');
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*html:not\(\[data-motion="full"\]\) \.voice-stage-veil/,
    );
    expect(css).not.toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*html\[data-motion="full"\] \.voice-stage-veil/,
    );
    expect(css).toContain('html[data-voice-mode]');
    expect(css).toContain('html[data-voice-mode="intro"]');
    expect(css).toContain('.voice-orb-gif');
    expect(css).toContain('.voice-orb-still');
    expect(css).toContain('.voice-orb-wash');
    expect(css).not.toContain('.voice-orb-indicator');
    expect(css).not.toContain('@keyframes voice-orb-indicator-speak');
    expect(css).toContain('@keyframes voice-orb-speak');
    expect(css).toMatch(/@keyframes voice-orb-speak \{[\s\S]*scale\(1\.12\)[\s\S]*scale\(1\)/);
    expect(css).toContain('@keyframes voice-orb-act-halo');
    expect(css).not.toMatch(/\.voice-orb-media \{[^}]*mask-image/);
    expect(css).toContain('object-position: 0% 50%');
    expect(css).toContain('object-fit: cover');
    expect(css).toContain('color-mix(in srgb, var(--c-paper) 56%, transparent)');
    expect(css).toContain('html[data-motion="reduced"] .voice-orb-gif');
    expect(css).toContain('html[data-motion="reduced"] .voice-orb-still');
    expect(css).toContain('html:not([data-motion="full"]) .voice-orb-gif');
    expect(css).toContain('html:not([data-motion="full"]) .voice-orb-still');
    expect(css).toContain('html[data-motion="reduced"] .voice-orb-wash { opacity: 0.22; }');
    expect(css).toContain('html:not([data-motion="full"]) .voice-orb-wash { opacity: 0.22; }');
    expect(css).toContain('opacity: calc(0.22 + var(--voice-level, 0) * 0.38)');
    expect(stage).not.toContain('line-clamp-3');
    expect(stage).not.toContain('-webkit-line-clamp');
    expect(stage).toContain('data-subtitle-phase={snapshot.subtitlePhase}');
    expect(stage).toContain('max-h-[7.5rem]');
    expect(stage).toContain('max-w-[min(24rem,calc(100vw-1.5rem))]');
    expect(stage).toContain('justify-end');
    expect(stage).toContain('overflow-hidden');
    expect(css).toContain('.voice-dock-transcript[data-subtitle-phase="exiting"]');
    expect(stage).toContain('reducedMotion={reducedMotion}');
    expect(stage).toContain('VOICE_EXIT_VEIL_MS');
    expect(stage).toContain('data-voice-exit-chrome');
    expect(stage).toContain('data-voice-exit-orb');
    expect(stage).toContain('activeAnimation.cancel()');
    expect(stage).not.toMatch(/\[exiting, intro, live, reducedMotion, isMobile, snapshot\.phase\]/);
    expect(stage).toMatch(/\}, \[exiting, intro, live, reducedMotion, isMobile\]\);/);
    expect(css).toContain('transition: opacity 420ms ease-out');
    expect(css).not.toContain('@keyframes voice-stage-veil-intro');
    expect(css).not.toContain('@keyframes voice-stage-veil-live');
    expect(css).not.toMatch(/\.voice-stage-veil\[data-veil="intro"\][\s\S]{0,80}animation:\s*voice-stage-veil-intro/);
    expect(css).not.toMatch(/\.voice-stage-veil\[data-veil="live"\][\s\S]{0,80}animation:\s*voice-stage-veil-live/);
    expect(css).toContain('@keyframes voice-stage-veil-exit-live');
    expect(css).toContain('@keyframes voice-stage-veil-exit-intro');
    expect(orb).toContain("const speakingNow = phase === 'speaking'");
    expect(orb).not.toContain('level > SPEAKING_LEVEL');
    expect(stage).toMatch(/style=\{isMobile \? MOBILE_DOCK_STYLE : DESKTOP_DOCK_STYLE\}/);
    expect(stage).toContain('aria-label="Hang up voice call"');
    expect(stage).toContain('/microphone|voice input/i.test(snapshot.error)');
    expect(stage).toContain('Enable mic');
    expect(stage).toContain('import { MicOff, Phone, RotateCcw } from \'lucide-react\'');
    expect(stage).toContain('<Phone size={17} aria-hidden className="rotate-[135deg]" />');
    expect(stage).not.toContain('PhoneOff');
    expect(stage).toContain('flex flex-row items-center gap-3');
    expect(stage).not.toContain('flex-col-reverse');
    expect(stage).toContain('font-hand text-xs leading-snug');
    expect(orb).toMatch(/\{reducedMotion \? \([\s\S]*voice-orb-still[\s\S]*\) : \([\s\S]*voice-orb-gif/);
    expect(orb.match(/<img\b/g) ?? []).toHaveLength(2);
    expect(orb).toMatch(/if \(reducedMotion\) \{[\s\S]*return;[\s\S]*subscribeVoicePlaybackLevel/);
    expect(orb).toContain('{PHASE_LABEL[phase]}');
    expect(orb).not.toContain('voice-orb-indicator');
    expect(stage).toContain('h-[100dvh]');
  });

  it('loads the voice runtime and prefetches media on enter, not idle mount', () => {
    const controller = read('components/voice/VoiceModeController.tsx');

    expect(controller).not.toMatch(/from ['"]@\/lib\/voiceSessionRuntime['"]/);
    expect(controller).toContain("import('@/lib/voiceSessionRuntime')");
    expect(controller).toContain(
      "const shouldLoad = request === 'enter' || cachedRuntime !== null || runtimeImport !== null",
    );
    expect(controller).toContain('if (!shouldLoad) return');
    expect(controller).toContain(
      "const shouldRetry = request === 'enter' || runtimeImport !== null",
    );
    expect(controller).toContain("if (!(snapshot.active || request === 'enter')) return");
    expect(controller).toContain('scheduleVoiceAssetPrefetch()');
    expect(controller).not.toMatch(/if \(!runtime && !snapshot\.active\) return/);
  });
});