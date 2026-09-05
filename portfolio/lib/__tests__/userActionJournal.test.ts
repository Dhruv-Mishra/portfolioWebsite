import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  USER_ACTION_JOURNAL_MAX_AGE_MS,
  USER_ACTION_JOURNAL_MAX_ENTRIES,
  USER_ACTION_JOURNAL_MAX_EXPOSED_ACTIONS,
  USER_ACTION_JOURNAL_STORAGE_KEY,
  appendUserAction,
  formatUserActionJournal,
  readUserActionJournal,
  sanitizeUserAction,
} from '@/lib/userActionJournal';
import { buildVoiceSystemInstruction } from '@/lib/voiceAgentPrompt';
import { buildVoiceClientStateParagraph } from '@/lib/voiceClientSnapshot';
import { executeSiteTool } from '@/lib/siteToolExecutor';

describe('userActionJournal', () => {
  let mockStore: Record<string, string> = {};

  beforeEach(() => {
    mockStore = {};
    const mockSessionStorage = {
      getItem: vi.fn((key: string) => mockStore[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStore[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStore[key];
      }),
      clear: vi.fn(() => {
        mockStore = {};
      }),
      key: vi.fn(() => null),
      length: 0,
    };

    vi.stubGlobal('sessionStorage', mockSessionStorage);
    vi.stubGlobal('window', {
      sessionStorage: mockSessionStorage,
      location: { pathname: '/projects/', search: '?project=cropio' },
      dispatchEvent: () => true,
      open: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('appends and reads back valid actions', () => {
    appendUserAction({ kind: 'route.view', route: '/projects' }, 1000);
    appendUserAction({ kind: 'project.open', slug: 'cropio' }, 2000);
    appendUserAction({ kind: 'terminal.run', command: 'about' }, 3000);
    appendUserAction({ kind: 'chat.sent' }, 4000);

    const entries = readUserActionJournal(5000);
    expect(entries).toHaveLength(4);
    expect(entries[0]).toEqual({ kind: 'route.view', route: '/projects', timestamp: 1000 });
    expect(entries[1]).toEqual({ kind: 'project.open', slug: 'cropio', timestamp: 2000 });
    expect(entries[2]).toEqual({ kind: 'terminal.run', command: 'about', timestamp: 3000 });
    expect(entries[3]).toEqual({ kind: 'chat.sent', timestamp: 4000 });

    const formatted = formatUserActionJournal(entries);
    expect(formatted).toEqual([
      'project.open cropio',
      'terminal.run about',
      'chat.sent',
    ]);
  });

  it('caps exposed actions to the newest 3 preserving insertion order while journal retains up to 10', () => {
    expect(USER_ACTION_JOURNAL_MAX_EXPOSED_ACTIONS).toBe(3);
    const base = 100_000;
    appendUserAction({ kind: 'route.view', route: '/projects' }, base + 1000);
    appendUserAction({ kind: 'project.open', slug: 'cropio' }, base + 2000);
    appendUserAction({ kind: 'terminal.run', command: 'about' }, base + 3000);
    appendUserAction({ kind: 'chat.sent' }, base + 4000);
    appendUserAction({ kind: 'route.view', route: '/about' }, base + 5000);

    const stored = readUserActionJournal(base + 6000);
    expect(stored).toHaveLength(5);

    const exposed = formatUserActionJournal(stored);
    expect(exposed).toHaveLength(3);
    expect(exposed).toEqual([
      'terminal.run about',
      'chat.sent',
      'route.view /about',
    ]);
  });

  it('enforces max-10 truncation, discarding oldest entries', () => {
    const baseTime = 100_000;
    for (let i = 0; i < 15; i++) {
      appendUserAction({ kind: 'terminal.run', command: 'about' }, baseTime + i * 1000);
    }

    const entries = readUserActionJournal(baseTime + 20_000);
    expect(entries).toHaveLength(USER_ACTION_JOURNAL_MAX_ENTRIES);
    // Oldest 5 dropped; should have timestamps 105_000 to 114_000
    expect(entries[0].timestamp).toBe(baseTime + 5000);
    expect(entries[entries.length - 1].timestamp).toBe(baseTime + 14_000);
  });

  it('discards entries older than 30 minutes', () => {
    const now = 2_000_000;
    const oldTime = now - USER_ACTION_JOURNAL_MAX_AGE_MS - 1; // 30 min + 1ms ago
    const freshTime = now - USER_ACTION_JOURNAL_MAX_AGE_MS + 10_000; // 29m 50s ago

    appendUserAction({ kind: 'route.view', route: '/about' }, oldTime);
    appendUserAction({ kind: 'route.view', route: '/resume' }, freshTime);

    const entries = readUserActionJournal(now);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ kind: 'route.view', route: '/resume', timestamp: freshTime });
  });

  it('sanitizes and rejects malformed entries, sensitive commands, and arbitrary fields', () => {
    // Arbitrary routes or raw urls with queries/hashes
    expect(sanitizeUserAction({ kind: 'route.view', route: '/unknown-route' })).toBeNull();
    expect(sanitizeUserAction({ kind: 'route.view', route: '/projects?secret=1#hash' })).toBeNull();
    expect(sanitizeUserAction({ kind: 'route.view', route: 'https://evil.com' })).toBeNull();

    // Sensitive or easter egg terminal commands
    expect(sanitizeUserAction({ kind: 'terminal.run', command: 'sudo' })).toBeNull();
    expect(sanitizeUserAction({ kind: 'terminal.run', command: 'matrix' })).toBeNull();
    expect(sanitizeUserAction({ kind: 'terminal.run', command: 'unlockstickers' })).toBeNull();
    expect(sanitizeUserAction({ kind: 'terminal.run', command: 'hesoyam' })).toBeNull();
    expect(sanitizeUserAction({ kind: 'terminal.run', command: 'rm -rf /' })).toBeNull();

    // Noise / utility / non-substantive terminal commands omitted from allowlist
    expect(sanitizeUserAction({ kind: 'terminal.run', command: 'help' })).toBeNull();
    expect(sanitizeUserAction({ kind: 'terminal.run', command: 'hint' })).toBeNull();
    expect(sanitizeUserAction({ kind: 'terminal.run', command: 'joke' })).toBeNull();
    expect(sanitizeUserAction({ kind: 'terminal.run', command: 'clear' })).toBeNull();
    expect(sanitizeUserAction({ kind: 'terminal.run', command: 'ls' })).toBeNull();
    expect(sanitizeUserAction({ kind: 'terminal.run', command: 'date' })).toBeNull();
    expect(sanitizeUserAction({ kind: 'terminal.run', command: 'whoami' })).toBeNull();
    expect(sanitizeUserAction({ kind: 'terminal.run', command: 'cheatsheet' })).toBeNull();

    // Allowed consequential public commands
    expect(sanitizeUserAction({ kind: 'terminal.run', command: 'about' })).toEqual({
      kind: 'terminal.run',
      command: 'about',
    });
    expect(sanitizeUserAction({ kind: 'terminal.run', command: 'skills' })).toEqual({
      kind: 'terminal.run',
      command: 'skills',
    });

    // Sensitive content injected in chat or feedback
    const strippedChat = sanitizeUserAction({
      kind: 'chat.sent',
      text: 'super secret prompt text',
      transcript: 'user audio transcript',
      metadata: { ip: '127.0.0.1' },
    });
    expect(strippedChat).toEqual({ kind: 'chat.sent' });
    expect(JSON.stringify(strippedChat)).not.toMatch(/secret|transcript|metadata/);

    // Removed project.close must be rejected by sanitizer
    expect(sanitizeUserAction({ kind: 'project.close', slug: 'cropio' })).toBeNull();
    expect(sanitizeUserAction({ kind: 'project.close' })).toBeNull();

    // Malformed JSON in storage
    mockStore[USER_ACTION_JOURNAL_STORAGE_KEY] = 'not-valid-json';
    expect(readUserActionJournal()).toEqual([]);

    // Malformed array items in storage
    mockStore[USER_ACTION_JOURNAL_STORAGE_KEY] = JSON.stringify([
      null,
      42,
      'string',
      { kind: 'fake.event', timestamp: Date.now() },
      { kind: 'terminal.run', command: 'sudo', timestamp: Date.now() },
      { kind: 'terminal.run', command: 'about', timestamp: 'not-a-number' },
      { kind: 'terminal.run', command: 'about', timestamp: Date.now() },
    ]);

    const recovered = readUserActionJournal();
    expect(recovered).toHaveLength(1);
    expect(recovered[0].kind).toBe('terminal.run');
    expect((recovered[0] as { command: string }).command).toBe('about');
  });

  it('suppresses identical consecutive route.view and project.open within the short window', () => {
    // Consecutive identical route.view within 2s -> suppressed
    appendUserAction({ kind: 'route.view', route: '/projects' }, 1000);
    appendUserAction({ kind: 'route.view', route: '/projects' }, 1800);
    expect(readUserActionJournal(2000)).toHaveLength(1);

    // Different route within 2s -> not suppressed
    appendUserAction({ kind: 'route.view', route: '/about' }, 2200);
    expect(readUserActionJournal(3000)).toHaveLength(2);

    // Revisit to /projects after window (> 2000ms from 1000) -> not suppressed
    appendUserAction({ kind: 'route.view', route: '/projects' }, 4500);
    expect(readUserActionJournal(5000)).toHaveLength(3);

    // Consecutive identical project.open within 2s -> suppressed
    appendUserAction({ kind: 'project.open', slug: 'cropio' }, 5000);
    appendUserAction({ kind: 'project.open', slug: 'cropio' }, 5800);
    expect(readUserActionJournal(6000)).toHaveLength(4);

    // Different project within 2s -> not suppressed
    appendUserAction({ kind: 'project.open', slug: 'jarvis-voice-agent' }, 6200);
    expect(readUserActionJournal(7000)).toHaveLength(5);

    // Repeated chat.sent, terminal.run, or submissions within window are NOT suppressed
    appendUserAction({ kind: 'chat.sent' }, 7500);
    appendUserAction({ kind: 'chat.sent' }, 7900);
    expect(readUserActionJournal(8000)).toHaveLength(7);

    appendUserAction({ kind: 'terminal.run', command: 'about' }, 8100);
    appendUserAction({ kind: 'terminal.run', command: 'about' }, 8500);
    appendUserAction({ kind: 'feedback.submit' }, 8800);
    appendUserAction({ kind: 'guestbook.submit' }, 9000);

    // Max entries is 10, so oldest entry will be dropped
    const entries = readUserActionJournal(9500);
    expect(entries).toHaveLength(10);
    expect(entries[entries.length - 2]).toEqual({ kind: 'feedback.submit', timestamp: 8800 });
    expect(entries[entries.length - 1]).toEqual({ kind: 'guestbook.submit', timestamp: 9000 });
  });

  it('bounds restored input work and handles oversized raw storage safely', () => {
    // Oversized raw payload exceeds max byte cap (8KB) -> safely yields empty array
    const hugePayload = JSON.stringify(
      Array.from({ length: 500 }, (_, i) => ({
        kind: 'route.view',
        route: '/projects',
        timestamp: 1000 + i,
        filler: 'x'.repeat(50),
      })),
    );
    expect(hugePayload.length).toBeGreaterThan(8192);
    mockStore[USER_ACTION_JOURNAL_STORAGE_KEY] = hugePayload;
    expect(readUserActionJournal(10000)).toEqual([]);

    // Array with many items under the byte cap -> inspects bounded tail and caps to MAX_ENTRIES
    const now = 200_000;
    const manyItems = Array.from({ length: 50 }, (_, i) => ({
      kind: 'route.view',
      route: '/projects',
      timestamp: now - 50_000 + i * 1000,
    }));
    const payload = JSON.stringify(manyItems);
    expect(payload.length).toBeLessThan(8192);
    mockStore[USER_ACTION_JOURNAL_STORAGE_KEY] = payload;

    const restored = readUserActionJournal(now);
    expect(restored).toHaveLength(USER_ACTION_JOURNAL_MAX_ENTRIES);
    expect(restored[restored.length - 1].timestamp).toBe(now - 50_000 + 49 * 1000);
  });

  it('is SSR-safe and handles missing window/sessionStorage gracefully', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('sessionStorage', undefined);

    expect(() => appendUserAction({ kind: 'chat.sent' })).not.toThrow();
    expect(readUserActionJournal()).toEqual([]);
  });

  it('disconfirming check: fails if recent actions are eagerly included in prompts or mint', () => {
    appendUserAction({ kind: 'route.view', route: '/projects' });
    appendUserAction({ kind: 'project.open', slug: 'cropio' });
    appendUserAction({ kind: 'terminal.run', command: 'about' });

    const systemPrompt = buildVoiceSystemInstruction();
    // Prompt must not contain stored actions or storage key
    expect(systemPrompt).not.toContain('cropio');
    expect(systemPrompt).not.toContain(USER_ACTION_JOURNAL_STORAGE_KEY);
    expect(systemPrompt).not.toContain('terminal.run about');

    const clientState = buildVoiceClientStateParagraph({
      route: '/projects',
      openProject: 'cropio',
    });
    // Session state paragraph must not contain journal entries
    expect(clientState).not.toContain('terminal.run');
    expect(clientState).not.toContain(USER_ACTION_JOURNAL_STORAGE_KEY);
  });

  it('disconfirming check: fails if current context disappears from tool output', async () => {
    appendUserAction({ kind: 'route.view', route: '/projects' });
    appendUserAction({ kind: 'project.open', slug: 'cropio' });

    const runtime = {
      router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() },
      setTheme: vi.fn(),
      resolvedTheme: 'dark' as const,
      discoActive: false,
      pathname: '/projects',
    };

    const result = await executeSiteTool({
      id: 'recent-ctx-test',
      name: 'get_recent_user_context',
      args: {},
    }, runtime as never, { commit: false });

    expect(result.ok).toBe(true);
    expect(result.data).toBeDefined();
    // Current context MUST be present and not empty
    expect(result.data?.pageContext).toEqual({
      route: '/projects',
      topic: 'projects',
      theme: 'dark',
      disco: false,
      muted: false,
      volume: 100,
      openProject: 'cropio',
    });
    // Recent actions must be present
    expect(result.data?.recentActions).toEqual([
      'route.view /projects',
      'project.open cropio',
    ]);
  });

  it('contract: Terminal only emits terminal.run on successful execution of consequential public commands', () => {
    const terminalSource = fs.readFileSync(
      path.join(process.cwd(), 'components', 'Terminal.tsx'),
      'utf8',
    );
    // Must not emit terminal.run unconditionally before registry execution
    expect(terminalSource).not.toMatch(/unlockSticker\('first-word'\);\s+if\s*\(isPublicTerminalCommand\(lowerCmd\)\)\s*\{\s*appendUserAction/);
    // Must emit terminal.run only inside the try block after commandDef execution resolves
    expect(terminalSource).toMatch(/const result = await commandDef\(args\);[\s\S]*?if\s*\(isPublicTerminalCommand\(lowerCmd\)\)\s*\{\s*appendUserAction\(\{ kind: 'terminal\.run', command: lowerCmd \}\);/);
  });

  it('contract: StickyNoteChat only emits chat.sent after hardcoded acceptance or remote sendMessage resolves true', () => {
    const chatSource = fs.readFileSync(
      path.join(process.cwd(), 'components', 'StickyNoteChat.tsx'),
      'utf8',
    );
    // Must not emit chat.sent unconditionally at handleSendFromInput start
    expect(chatSource).not.toMatch(/soundManager\.play\('chat-send'\);\s+appendUserAction\(\{ kind: 'chat\.sent' \}\);/);
    // Must emit after sendHardcoded returns true
    expect(chatSource).toMatch(/sendHardcoded\(text, getSuggestionResponse\(text\)\)\)\s*\{[\s\S]*?appendUserAction\(\{ kind: 'chat\.sent' \}\);/);
    // Must emit after sendMessage resolves true
    expect(chatSource).toMatch(/void accepted\.then\(\(wasAccepted\) => \{[\s\S]*?if\s*\(wasAccepted\)\s*\{\s*appendUserAction\(\{ kind: 'chat\.sent' \}\);/);
  });

});
