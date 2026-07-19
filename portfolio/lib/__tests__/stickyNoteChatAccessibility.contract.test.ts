import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.join(process.cwd(), 'components', 'StickyNoteChat.tsx'),
  'utf8',
);

describe('sticky note chat standalone accessibility contract', () => {
  it('renders the critical composer usable before lazy motion features load', () => {
    expect(source).toMatch(/initial=\{false\}\s+animate=\{INPUT_NOTE_ANIMATE\}\s+data-disco-motion="bob"\s+data-disco-chat-input/);
    expect(source).not.toContain('INPUT_NOTE_INITIAL');
  });

  it('reserves measured composer space for the overlaid transcript', () => {
    expect(source).toContain('const composerRef = useRef<HTMLDivElement>(null);');
    expect(source).toContain('new ResizeObserver(measureComposer)');
    expect(source).toContain('new MutationObserver(measureComposer)');
    expect(source).toContain("'--chat-composer-height': `${composerHeight}px`");
    expect(source).toContain("paddingBottom: 'calc(var(--chat-composer-height, 0px) + env(safe-area-inset-bottom, 0px) + 0.75rem)'");
    expect(source).not.toContain('py-4 pb-32 md:pb-28');
  });

  it('announces each completed new assistant reply once, after typing finishes', () => {
    expect(source).toContain('const announcedAssistantReplyRef = useRef<string | null>(null);');
    expect(source).toContain('const [assistantReplyAnnouncement, setAssistantReplyAnnouncement] = useState<{ id: string; text: string } | null>(null);');
    expect(source).toContain('!completedMessage.isOld');
    expect(source).toContain('!completedMessage.isFiller');
    expect(source).toContain("completedMessage.matrixInterceptKind !== 'denied'");
    expect(source).toContain('announcedAssistantReplyRef.current !== messageId');
    expect(source).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(source).toContain('key={assistantReplyAnnouncement.id}');
    expect(source).toContain("msg.role === 'assistant' && !msg.isOld && msg.id !== 'welcome'");
  });

  it('auto-plays a new speakable assistant reply when its final text starts typewriting', () => {
    expect(source).toContain('const { enabled: speakByDefault } = useSpeakByDefaultPref();');
    expect(source).toContain('const autoSpokenAssistantRef = useRef<string | null>(null);');
    expect(source).toContain('if (!targetIsFiller) notifyStart();');
    expect(source).toContain('canSpeakAssistantMessage(message)');
    expect(source).toContain('ttsActiveMessageId === message.id');
    expect(source).toContain('autoSpokenAssistantRef.current === message.id');
    expect(source).toContain('autoSpokenAssistantRef.current = message.id;');
    expect(source).toContain('void toggleTtsPlayback(message.id, message.content');
    expect(source).toContain("onTypewriterStart={msg.role === 'assistant' && !msg.isOld && msg.id !== 'welcome'");
    expect(source).toContain("onTypewriterDone={msg.role === 'assistant' && !msg.isOld && msg.id !== 'welcome'");
  });

  it('restores textarea focus after a composer-originated canned or completed remote send without stealing another control', () => {
    expect(source).toContain('const focusWasInComposer = composerRef.current?.contains(document.activeElement) ?? false;');
    expect(source).toContain('const composerFocusRequestSequenceRef = useRef(0);');
    expect(source).toContain('const restoreComposerFocusAfterRemoteSendRef = useRef<number | null>(null);');
    expect(source).toContain('const remoteSendLoadingStartedForFocusRef = useRef<number | null>(null);');
    expect(source).toContain('if (focusWasInComposer) restoreComposerFocusIfAppropriate(composerRef.current);');
    expect(source).toContain('const focusRequestId = ++composerFocusRequestSequenceRef.current;');
    expect(source).toContain('restoreComposerFocusAfterRemoteSendRef.current = focusWasInComposer ? focusRequestId : null;');
    expect(source).toContain('const accepted = sendMessage(text, image);');
    expect(source).toContain('void accepted.then((wasAccepted) => {');
    expect(source).toContain('!wasAccepted &&');
    expect(source).toContain('restoreComposerFocusAfterRemoteSendRef.current === focusRequestId');
    expect(source).toContain('remoteSendLoadingStartedForFocusRef.current !== focusRequestId');
    expect(source).toContain('if (isLoading && !previousLoadingRef.current) {');
    expect(source).toContain('remoteSendLoadingStartedForFocusRef.current = restoreComposerFocusAfterRemoteSendRef.current;');
    expect(source).toContain('remoteSendLoadingStartedForFocusRef.current === focusRequestId');
    expect(source).toContain('function restoreComposerFocusIfAppropriate(composer: HTMLDivElement | null): void');
    expect(source).toContain("const textarea = composer?.querySelector<HTMLTextAreaElement>('textarea[aria-label=\"Chat message\"]');");
    expect(source).toContain("const sendButton = composer?.querySelector<HTMLButtonElement>('button[aria-label=\"Send message\"]');");
    expect(source).toContain('activeElement !== textarea && activeElement !== sendButton');
    expect(source).toContain('textarea.focus();');
  });
});