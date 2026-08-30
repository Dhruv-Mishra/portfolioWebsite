import { afterEach, describe, expect, it, vi } from 'vitest';
import { SITE_TOOL_DECLARATIONS, VOICE_LIVE_TOOL_DECLARATIONS, assertCompleteToolCatalog } from '@/lib/siteToolDeclarations';
import { SITE_TOOL_NAMES, resolveVoiceSafeTerminalCommand } from '@/lib/siteTools';
import { parseSiteToolCall } from '@/lib/siteToolValidation';
import { executeSiteTool } from '@/lib/siteToolExecutor';
import { actionFromSiteTool } from '@/lib/siteToolBridge';
import { hasActionExecution } from '@/lib/actions';
import {
  __resetStoreForTest,
  getAudioCategoryVolumeSync,
  getSoundsMutedSync,
  setSoundsMutedImperative,
} from '@/hooks/useStickers';
import {
  OPEN_PROJECT_EVENT,
  SEND_CHAT_MESSAGE_EVENT,
  RUN_TERMINAL_COMMAND_EVENT,
  SUBMIT_FEEDBACK_EVENT,
  SUBMIT_GUESTBOOK_EVENT,
  attachSiteActionResult,
  buildProjectHref,
  readProjectSlugFromSearch,
  requestOpenProject,
  requestRunTerminalCommand,
  requestSendChatMessage,
  scrollRoutePage,
} from '@/lib/siteActionEvents';

describe('site tool catalog', () => {
  it('declares every shared tool exactly once', () => {
    expect(() => assertCompleteToolCatalog()).not.toThrow();
    expect(SITE_TOOL_DECLARATIONS.map(tool => tool.name).sort()).toEqual([...SITE_TOOL_NAMES].sort());
    expect(VOICE_LIVE_TOOL_DECLARATIONS.map(tool => tool.name)).not.toContain('start_voice_session');
    expect(VOICE_LIVE_TOOL_DECLARATIONS).toHaveLength(SITE_TOOL_DECLARATIONS.length - 1);
    expect(
      VOICE_LIVE_TOOL_DECLARATIONS.find(tool => tool.name === 'set_theme')?.parameters.properties.action,
    ).toMatchObject({ enum: expect.arrayContaining(['disco']) });
    expect(SITE_TOOL_DECLARATIONS.find(tool => tool.name === 'fill_field')?.parameters.properties).not.toHaveProperty('submit');
  });

  it('accepts valid navigate and guestbook calls', () => {
    expect(parseSiteToolCall({
      id: '1',
      name: 'navigate_to',
      args: { path: '/projects' },
    })).toEqual({
      id: '1',
      name: 'navigate_to',
      args: { path: '/projects' },
    });

    expect(parseSiteToolCall({
      name: 'submit_guestbook',
      args: { message: 'Loved the sketchbook notes.', name: 'Ada' },
    })).toMatchObject({
      name: 'submit_guestbook',
      args: { message: 'Loved the sketchbook notes.', name: 'Ada' },
    });

    expect(parseSiteToolCall({
      name: 'submit_feedback',
      args: { message: 'The resume PDF button is hard to find.', contact: 'ada@example.com', category: 'bug' },
    })).toMatchObject({
      name: 'submit_feedback',
      args: {
        message: 'The resume PDF button is hard to find.',
        contact: 'ada@example.com',
        category: 'bug',
      },
    });
  });

  it('rejects unknown tools and unsafe args', () => {
    expect(parseSiteToolCall({ name: 'rm_rf', args: {} })).toBeNull();
    expect(parseSiteToolCall({ name: 'navigate_to', args: { path: '/admin' } })).toBeNull();
    expect(parseSiteToolCall({ name: 'open_link', args: { key: 'evil' } })).toBeNull();
    expect(parseSiteToolCall({ name: 'submit_guestbook', args: { message: 'hi' } })).toBeNull();
    expect(parseSiteToolCall({ name: 'submit_feedback', args: { message: 'hi' } })).toBeNull();
    expect(parseSiteToolCall({
      name: 'submit_feedback',
      args: { message: 'The resume PDF button is hard to find.', category: 'urgent' },
    })).toBeNull();
    expect(parseSiteToolCall({ name: 'fill_field', args: { field: 'password', value: 'x' } })).toBeNull();
    expect(parseSiteToolCall({
      name: 'fill_field',
      args: { field: 'chat-composer', value: 'hello', submit: true },
    })).toBeNull();
    expect(parseSiteToolCall({
      name: 'fill_field',
      args: { field: 'terminal-input', value: 'help', submit: true },
    })).toBeNull();
    expect(hasActionExecution({
      fieldFill: { field: 'chat-composer', value: 'hello', submit: true },
    })).toBe(false);
    expect(parseSiteToolCall({
      name: 'submit_guestbook',
      args: { message: 'Visit https://example.com for more notes.' },
    })).toBeNull();
    expect(parseSiteToolCall({ name: 'run_terminal_command', args: { command: 'sudo' } })).toBeNull();
    expect(parseSiteToolCall({ name: 'run_terminal_command', args: { command: 'clear' } })).toBeNull();
    expect(parseSiteToolCall({ name: 'run_terminal_command', args: { command: 'matrix' } })).toBeNull();
    expect(parseSiteToolCall({ name: 'run_terminal_command', args: { command: 'help', extra: 'all' } })).toBeNull();
    expect(parseSiteToolCall({ name: 'scroll_page', args: { direction: 'sideways' } })).toBeNull();
    expect(parseSiteToolCall({ name: 'scroll_page', args: { direction: 'down', amount: 9 } })).toBeNull();
    expect(parseSiteToolCall({ name: 'send_chat_message', args: { message: '' } })).toBeNull();
    expect(parseSiteToolCall({ name: 'control_project_video', args: { action: 'seek' } })).toBeNull();
    expect(parseSiteToolCall({ name: 'set_master_volume', args: { percent: 101 } })).toBeNull();
    expect(parseSiteToolCall({
      name: 'set_audio_category_volume',
      args: { category: 'voiceAgent', percent: 40 },
    })).toBeNull();
    expect(parseSiteToolCall({
      name: 'set_audio_category_volume',
      args: { category: 'voice-agent', percent: 101 },
    })).toBeNull();
  });

  it('accepts the expanded typed voice actions', () => {
    expect(parseSiteToolCall({
      name: 'open_project',
      args: { slug: 'cropio' },
    })).toEqual({
      id: 'tool-open_project',
      name: 'open_project',
      args: { slug: 'cropio' },
    });
    expect(parseSiteToolCall({
      name: 'close_project',
      args: {},
    })).toMatchObject({ name: 'close_project', args: {} });
    expect(actionFromSiteTool({
      id: 'close-1',
      name: 'close_project',
      args: {},
    })).toBeNull();
    expect(parseSiteToolCall({
      name: 'control_project_video',
      args: { action: 'play' },
    })).toMatchObject({ name: 'control_project_video', args: { action: 'play' } });
    expect(parseSiteToolCall({
      name: 'send_chat_message',
      args: { message: 'Tell me about Cropio' },
    })).toMatchObject({ name: 'send_chat_message', args: { message: 'Tell me about Cropio' } });
    expect(parseSiteToolCall({
      name: 'scroll_page',
      args: { direction: 'down' },
    })).toMatchObject({ name: 'scroll_page', args: { direction: 'down', amount: 0.9 } });
    expect(parseSiteToolCall({
      name: 'fill_field',
      args: { field: 'terminal-input', value: 'hello' },
    })).toEqual({
      id: 'tool-fill_field',
      name: 'fill_field',
      args: { field: 'terminal-input', value: 'hello' },
    });
    expect(parseSiteToolCall({
      name: 'run_terminal_command',
      args: { command: 'help' },
    })).toMatchObject({ name: 'run_terminal_command', args: { command: 'help' } });
    expect(parseSiteToolCall({
      name: 'run_terminal_command',
      args: { command: 'hint' },
    })).toMatchObject({ name: 'run_terminal_command', args: { command: 'hint' } });
    expect(parseSiteToolCall({
      name: 'run_terminal_command',
      args: { command: '/hint' },
    })).toMatchObject({ name: 'run_terminal_command', args: { command: 'hint' } });
    expect(parseSiteToolCall({
      name: 'set_voice_output',
      args: { mode: 'device' },
    })).toMatchObject({ name: 'set_voice_output', args: { mode: 'device' } });
    expect(parseSiteToolCall({
      name: 'set_motion_preference',
      args: { motion: 'reduced' },
    })).toMatchObject({ name: 'set_motion_preference', args: { motion: 'reduced' } });
    expect(parseSiteToolCall({
      name: 'set_master_volume',
      args: { percent: 40 },
    })).toMatchObject({ name: 'set_master_volume', args: { percent: 40 } });
    expect(parseSiteToolCall({
      name: 'set_audio_category_volume',
      args: { category: 'voice-agent', percent: 40 },
    })).toMatchObject({
      name: 'set_audio_category_volume',
      args: { category: 'voice-agent', percent: 40 },
    });
    expect(parseSiteToolCall({
      name: 'browse_history',
      args: { direction: 'back' },
    })).toMatchObject({ name: 'browse_history', args: { direction: 'back' } });
  });

  it('builds a navigation-stable project href', () => {
    expect(buildProjectHref('cropio')).toBe('/projects?project=cropio');
    expect(readProjectSlugFromSearch('?project=cropio')).toBe('cropio');
    expect(actionFromSiteTool({
      id: '1',
      name: 'open_project',
      args: { slug: 'cropio' },
    })).toEqual({ projectSlug: 'cropio' });
  });
});

describe('site tool executor hosts', () => {
  afterEach(() => {
    __resetStoreForTest();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  const runtime = {
    router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() },
    setTheme: vi.fn(),
    resolvedTheme: 'light',
    discoActive: false,
    openFeedback: vi.fn(),
    openProject: vi.fn(),
  };

  it('sets a category volume without changing mute', async () => {
    setSoundsMutedImperative(true);
    const cases = [
      ['voice-agent', 'voiceAgent', 25],
      ['website-effects', 'siteSfx', 35],
      ['chat-read-aloud', 'chatTts', 45],
    ] as const;

    for (const [category, storeCategory, percent] of cases) {
      await expect(executeSiteTool({
        id: `volume-${category}`,
        name: 'set_audio_category_volume',
        args: { category, percent },
      }, runtime as never)).resolves.toMatchObject({
        ok: true,
        data: { category, percent },
      });
      expect(getAudioCategoryVolumeSync(storeCategory)).toBe(percent / 100);
    }
    expect(getSoundsMutedSync()).toBe(true);
  });

  it('returns unavailable when chat or terminal hosts are missing', async () => {
    vi.stubGlobal('window', {
      dispatchEvent: () => true,
      open: vi.fn(),
    });

    await expect(executeSiteTool({
      id: 'chat-1',
      name: 'send_chat_message',
      args: { message: 'Hello from voice' },
    }, runtime as never)).resolves.toMatchObject({
      ok: false,
      errorCode: 'chat-unavailable',
    });
    await expect(executeSiteTool({
      id: 'term-1',
      name: 'run_terminal_command',
      args: { command: 'help' },
    }, runtime as never)).resolves.toMatchObject({
      ok: false,
      errorCode: 'terminal-unavailable',
    });
    await expect(executeSiteTool({
      id: 'fill-no-doc',
      name: 'fill_field',
      args: { field: 'terminal-input', value: 'hello' },
    }, runtime as never)).resolves.toMatchObject({
      ok: false,
      errorCode: 'no-window',
    });
    await expect(executeSiteTool({
      id: 'gb-1',
      name: 'submit_guestbook',
      args: { message: 'Loved the sketchbook notes.' },
    }, runtime as never)).resolves.toMatchObject({
      ok: false,
      errorCode: 'guestbook-unavailable',
    });
    await expect(executeSiteTool({
      id: 'fb-1',
      name: 'submit_feedback',
      args: { message: 'The resume PDF button is hard to find.' },
    }, runtime as never)).resolves.toMatchObject({
      ok: false,
      errorCode: 'feedback-unavailable',
    });
  });

  it('uses the host chat send path when the composer is mounted', async () => {
    const dispatchEvent = vi.fn((event: Event) => {
      if (event.type === SEND_CHAT_MESSAGE_EVENT) {
        attachSiteActionResult(event, {
          ok: true,
          spokenText: 'Queued that note.',
          data: { accepted: true },
        });
      }
      return true;
    });
    vi.stubGlobal('window', { dispatchEvent, open: vi.fn() });

    await expect(executeSiteTool({
      id: 'chat-2',
      name: 'send_chat_message',
      args: { message: 'Hello from voice' },
    }, runtime as never)).resolves.toMatchObject({
      ok: true,
      spokenText: 'Queued that note.',
      data: { accepted: true },
    });
    expect(dispatchEvent).toHaveBeenCalled();
  });

  it('uses the host guestbook and feedback submit paths when those forms are mounted', async () => {
    const dispatchEvent = vi.fn((event: Event) => {
      if (event.type === SUBMIT_GUESTBOOK_EVENT) {
        attachSiteActionResult(event, {
          ok: true,
          spokenText: 'Pinning that note.',
          data: { accepted: true },
        });
      }
      if (event.type === SUBMIT_FEEDBACK_EVENT) {
        attachSiteActionResult(event, {
          ok: true,
          spokenText: 'Sending that feedback.',
          data: { accepted: true },
        });
      }
      return true;
    });
    vi.stubGlobal('window', { dispatchEvent, open: vi.fn() });

    await expect(executeSiteTool({
      id: 'gb-2',
      name: 'submit_guestbook',
      args: { message: 'Loved the sketchbook notes.', name: 'Ada' },
    }, runtime as never)).resolves.toMatchObject({
      ok: true,
      spokenText: 'Pinning that note.',
      data: { accepted: true },
    });
    await expect(executeSiteTool({
      id: 'fb-2',
      name: 'submit_feedback',
      args: { message: 'The resume PDF button is hard to find.', category: 'bug' },
    }, runtime as never)).resolves.toMatchObject({
      ok: true,
      spokenText: 'Sending that feedback.',
      data: { accepted: true },
    });
    expect(dispatchEvent).toHaveBeenCalled();
  });

  it('opens a project through the typed href when no page host claims it', async () => {
    vi.stubGlobal('window', { dispatchEvent: () => true, open: vi.fn() });

    await expect(executeSiteTool({
      id: 'proj-1',
      name: 'open_project',
      args: { slug: 'cropio' },
    }, runtime as never)).resolves.toMatchObject({
      ok: true,
      data: { slug: 'cropio', accepted: true },
    });
    expect(runtime.openProject).not.toHaveBeenCalled();
    expect(runtime.router.push).toHaveBeenCalledWith('/projects?project=cropio');
    expect(runtime.router.push).toHaveBeenCalledTimes(1);
  });

  it('returns the hosted project acknowledgement without a second navigation', async () => {
    const dispatchEvent = vi.fn((event: Event) => {
      if (event.type === OPEN_PROJECT_EVENT) {
        attachSiteActionResult(event, {
          ok: true,
          spokenText: 'Queued that project to open.',
          data: { slug: 'cropio', accepted: true },
        });
      }
      return true;
    });
    vi.stubGlobal('window', { dispatchEvent, open: vi.fn() });

    await expect(executeSiteTool({
      id: 'proj-2',
      name: 'open_project',
      args: { slug: 'cropio' },
    }, runtime as never)).resolves.toMatchObject({
      ok: true,
      spokenText: 'Queued that project to open.',
      data: { slug: 'cropio', accepted: true },
    });
    expect(runtime.openProject).not.toHaveBeenCalled();
    expect(runtime.router.push).not.toHaveBeenCalled();
  });

  it('treats a synchronous host claim as accepted, not completed', () => {
    const dispatchEvent = vi.fn((event: Event) => {
      if (event.type === SEND_CHAT_MESSAGE_EVENT) {
        attachSiteActionResult(event, {
          ok: true,
          spokenText: 'Queued that note.',
          data: { accepted: true },
        });
      }
      return !event.defaultPrevented;
    });
    vi.stubGlobal('window', { dispatchEvent });

    expect(requestSendChatMessage('Hello from voice')).toMatchObject({
      handled: true,
      result: { ok: true, spokenText: 'Queued that note.', data: { accepted: true } },
    });
    expect(requestOpenProject('cropio')).toMatchObject({ handled: false });
  });

  it('rejects unsafe terminal commands at the shared event guard', () => {
    expect(resolveVoiceSafeTerminalCommand({ command: 'help' })).toBe('help');
    expect(resolveVoiceSafeTerminalCommand({ command: 'hint' })).toBe('hint');
    expect(resolveVoiceSafeTerminalCommand({ command: '/hint' })).toBe('hint');
    expect(resolveVoiceSafeTerminalCommand({ command: 'sudo' })).toBeNull();
    expect(resolveVoiceSafeTerminalCommand({ command: 'matrix' })).toBeNull();
    expect(resolveVoiceSafeTerminalCommand({ command: 'hesoyam' })).toBeNull();
    expect(resolveVoiceSafeTerminalCommand({ command: 'unlockstickers' })).toBeNull();
    expect(resolveVoiceSafeTerminalCommand({ command: 'clear' })).toBeNull();
    expect(resolveVoiceSafeTerminalCommand({ command: 'help', extra: 'all' })).toBeNull();

    const dispatchEvent = vi.fn((event: Event) => {
      if (event.type === RUN_TERMINAL_COMMAND_EVENT) {
        const command = resolveVoiceSafeTerminalCommand((event as CustomEvent).detail);
        if (!command) {
          attachSiteActionResult(event, {
            ok: false,
            spokenText: 'That terminal command is not available.',
            errorCode: 'terminal-unsafe',
          });
        }
      }
      return !event.defaultPrevented;
    });
    vi.stubGlobal('window', { dispatchEvent });

    expect(requestRunTerminalCommand('sudo' as never)).toMatchObject({
      handled: true,
      result: { ok: false, errorCode: 'terminal-unsafe' },
    });
  });

  it('returns a structured facts result when fetch or JSON fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));

    await expect(executeSiteTool({
      id: 'facts-1',
      name: 'lookup_site_facts',
      args: { query: 'What is Cropio?' },
    }, runtime as never)).resolves.toMatchObject({
      ok: false,
      errorCode: 'facts-failed',
    });

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({ spokenText: 'unused' }),
    })));
    await expect(executeSiteTool({
      id: 'facts-2',
      name: 'lookup_site_facts',
      args: { query: 'What is Cropio?' },
    }, runtime as never)).resolves.toMatchObject({
      ok: false,
      errorCode: 'facts-failed',
    });

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new Error('bad json');
      },
    })));
    await expect(executeSiteTool({
      id: 'facts-3',
      name: 'lookup_site_facts',
      args: { query: 'What is Cropio?' },
    }, runtime as never)).resolves.toMatchObject({
      ok: false,
      errorCode: 'facts-invalid',
    });
  });

  it('scrolls the route container and rejects a missing container', () => {
    const container = { clientHeight: 800, scrollHeight: 2400, scrollTo: vi.fn(), scrollBy: vi.fn() };
    vi.stubGlobal('window', { innerHeight: 800 });
    vi.stubGlobal('document', {
      querySelector: () => container,
    });

    expect(scrollRoutePage('down', 0.9)).toMatchObject({ ok: true, data: { direction: 'down' } });
    expect(container.scrollBy).toHaveBeenCalledWith({ top: 720, behavior: 'smooth' });

    vi.stubGlobal('document', { querySelector: () => null });
    expect(scrollRoutePage('top', 1)).toMatchObject({ ok: false, errorCode: 'missing-scroll-container' });
  });
});
