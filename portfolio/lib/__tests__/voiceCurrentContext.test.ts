import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeSiteTool } from '@/lib/siteToolExecutor';
import { parseSiteToolCall } from '@/lib/siteToolValidation';
import { SITE_TOOL_DECLARATIONS } from '@/lib/siteToolDeclarations';
import { parseVoiceClientSnapshot } from '@/lib/voiceClientSnapshot';
import {
  buildVoiceCurrentPageContext,
  readVoiceCurrentContext,
  expectedPageContextAfterCloseProject,
  expectedPageContextAfterNavigate,
  expectedPageContextAfterOpenProject,
  withVoicePageContext,
} from '@/lib/voiceCurrentContext';

const runtime = {
  router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() },
  setTheme: vi.fn(),
  resolvedTheme: 'light' as const,
  discoActive: false,
  pathname: '/about',
};

describe('get_recent_user_context', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('defaults to orientation and validates selective read-only sections', () => {
    expect(SITE_TOOL_DECLARATIONS.find(tool => tool.name === 'get_recent_user_context')).toMatchObject({
      name: 'get_recent_user_context',
      parameters: { type: 'object', properties: { include: { maxItems: 3 } } },
    });
    expect(parseSiteToolCall({
      name: 'get_recent_user_context',
      args: {},
    })).toMatchObject({ name: 'get_recent_user_context', args: {} });
    expect(parseSiteToolCall({ name: 'get_recent_user_context', args: { include: ['media', 'media'] } }))
      .toMatchObject({ args: { include: ['media'] } });
    for (const args of [{ include: [] }, { include: ['secrets'] }, { include: ['page', 'chat', 'media', 'history'] }, { query: 'all' }]) {
      expect(parseSiteToolCall({ name: 'get_recent_user_context', args })).toBeNull();
    }
  });

  it('prefers the current browser path over a stale runtime pathname and allowlists fields', () => {
    const context = buildVoiceCurrentPageContext({
      runtime: { pathname: '/about', resolvedTheme: 'dark', discoActive: true },
      location: { pathname: '/projects/', search: '?project=cropio&utm=raw#secret' },
      disco: false,
      muted: true,
      volume: 40,
    });

    expect(context).toEqual({
      route: '/projects',
      topic: 'projects',
      theme: 'dark',
      disco: false,
      muted: true,
      volume: 40,
      openProject: 'cropio',
    });
    expect(JSON.stringify(context)).not.toMatch(/utm|raw|#secret|\/about|referrer|hash/i);
  });

  it('drops invalid routes, search, and off-route project slugs', () => {
    expect(buildVoiceCurrentPageContext({
      runtime: { pathname: '/admin' },
      location: { pathname: '/admin', search: '?project=cropio&token=abc' },
      disco: false,
      muted: false,
      volume: 10,
    })).toEqual({
      topic: 'generic',
      disco: false,
      muted: false,
      volume: 10,
    });
    expect(parseVoiceClientSnapshot({ route: '/resume', openProject: 'cropio' })).toEqual({
      route: '/resume',
    });
  });

  it('prefers the applied browser theme over stale runtime state', () => {
    vi.stubGlobal('document', { documentElement: { classList: { contains: (theme: string) => theme === 'dark' } } });
    expect(readVoiceCurrentContext(['preferences'], { runtime: { ...runtime, resolvedTheme: 'light' } }))
      .toMatchObject({ preferences: { theme: 'dark' } });
  });

  it('reads the live browser location and recent actions from the executor', async () => {
    vi.stubGlobal('window', {
      location: { pathname: '/resume/', search: '' },
      sessionStorage: {
        getItem: () => JSON.stringify([
          { kind: 'route.view', route: '/about', timestamp: Date.now() - 5000 },
          { kind: 'terminal.run', command: 'about', timestamp: Date.now() - 1000 },
        ]),
        setItem: () => {},
        removeItem: () => {},
      },
      dispatchEvent: () => true,
      open: vi.fn(),
    });

    await expect(executeSiteTool({
      id: 'ctx-live',
      name: 'get_recent_user_context',
      args: { include: ['page', 'history'] },
    }, runtime as never, { commit: false })).resolves.toMatchObject({
      ok: true,
      data: {
        pageContext: {
          route: '/resume',
          openProject: null,
        },
        recentActions: [
          'route.view /about',
          'terminal.run about',
        ],
      },
    });
    expect(runtime.router.push).not.toHaveBeenCalled();
  });

  it('caps recent actions to the newest 3 in get_recent_user_context', async () => {
    vi.stubGlobal('window', {
      location: { pathname: '/projects/', search: '' },
      sessionStorage: {
        getItem: () => JSON.stringify([
          { kind: 'route.view', route: '/about', timestamp: Date.now() - 50_000 },
          { kind: 'route.view', route: '/resume', timestamp: Date.now() - 40_000 },
          { kind: 'terminal.run', command: 'about', timestamp: Date.now() - 30_000 },
          { kind: 'chat.sent', timestamp: Date.now() - 20_000 },
          { kind: 'project.open', slug: 'cropio', timestamp: Date.now() - 10_000 },
        ]),
        setItem: () => {},
        removeItem: () => {},
      },
      dispatchEvent: () => true,
      open: vi.fn(),
    });

    const result = await executeSiteTool({
      id: 'ctx-cap-3',
      name: 'get_recent_user_context',
      args: { include: ['history'] },
    }, runtime as never, { commit: false });

    expect(result.ok).toBe(true);
    expect(result.data?.recentActions).toHaveLength(3);
    expect(result.data?.recentActions).toEqual([
      'terminal.run about',
      'chat.sent',
      'project.open cropio',
    ]);
  });

  it('keeps the default under 100 bytes and never samples DOM or history implicitly', () => {
    const querySelector = vi.fn(() => { throw new Error('Unrequested DOM read'); });
    const getItem = vi.fn(() => { throw new Error('Unrequested history read'); });
    vi.stubGlobal('document', { querySelector });
    vi.stubGlobal('window', { sessionStorage: { getItem } });
    const data = readVoiceCurrentContext(undefined, { runtime });
    expect(data).toEqual({ pageContext: { route: '/about', openProject: null } });
    expect(JSON.stringify(data).length).toBeLessThan(100);
    expect(querySelector).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
  });

  function visibleElement(text = '', attributes: Record<string, string> = {}) {
    const element = {
      textContent: text,
      tagName: 'DIV',
      getAttribute: (name: string) => attributes[name] ?? null,
      getClientRects: () => [{}],
      closest: vi.fn((selector: string) => selector === 'main, [data-site-context]' ? element : null),
      matches: vi.fn(() => false),
    };
    return element;
  }

  it('samples only requested chat state, caps text/history, and does not include assistant or attachment text', () => {
    const composer = { ...visibleElement(), value: 'draft '.repeat(200) };
    const messages = Array.from({ length: 10 }, (_, index) => visibleElement(`user ${index} ${'x'.repeat(1000)}`));
    const querySelector = vi.fn(() => composer);
    const querySelectorAll = vi.fn(() => messages);
    vi.stubGlobal('document', { querySelector, querySelectorAll });
    const data = readVoiceCurrentContext(['chat'], { runtime });
    expect(Object.keys(data)).toEqual(['chat']);
    expect(data.chat).toEqual({
      draft: expect.stringMatching(/\.\.\.$/),
      recentUserMessages: messages.slice(-3).map(message => `${message.textContent.slice(0, 237)}...`),
      omittedMessages: 7,
    });
    expect(querySelectorAll).toHaveBeenCalledWith('[data-site-chat-user]');
    expect(JSON.stringify(data).length).toBeLessThan(1100);
  });

  it('never samples private routes or hidden chat composers', () => {
    const hidden = visibleElement();
    hidden.getClientRects = () => [];
    const querySelector = vi.fn(() => hidden);
    vi.stubGlobal('document', { querySelector });
    expect(readVoiceCurrentContext(['chat'], { runtime })).toEqual({ chat: null });
    querySelector.mockClear();
    expect(readVoiceCurrentContext(['interaction', 'chat', 'media'], {
      location: { pathname: '/admin', search: '?token=secret' },
    })).toEqual({ interaction: null, chat: null, media: null });
    expect(querySelector).not.toHaveBeenCalled();
  });

  it.each([
    [{ paused: false, readyState: 4 }, 'playing'],
    [{ paused: true, readyState: 4 }, 'paused'],
    [{ paused: false, readyState: 2 }, 'buffering'],
    [{ ended: true }, 'ended'],
    [{ error: {} }, 'error'],
  ])('reads live video status %j without URLs or playback history', (state, status) => {
    const video = { ...visibleElement(), muted: true, volume: 0.4, ...state };
    const querySelector = vi.fn(() => video);
    vi.stubGlobal('document', { querySelector });
    const input = { location: { pathname: '/projects', search: '?project=cropio' } };
    expect(readVoiceCurrentContext(['media'], input)).toEqual({
      media: { project: 'cropio', status, muted: true, volume: 40 },
    });
    expect(querySelector).toHaveBeenCalledWith('[data-site-context="project-preview"][data-site-project="cropio"] video');
    querySelector.mockReturnValue(null as never);
    expect(readVoiceCurrentContext(['media'], input)).toEqual({ media: null });
  });

  it('distinguishes no project/video from stale modal state', () => {
    const querySelector = vi.fn();
    vi.stubGlobal('document', { querySelector });
    expect(readVoiceCurrentContext(['media'], { runtime })).toEqual({ media: null });
    expect(querySelector).not.toHaveBeenCalled();
  });

  it('reads current hover, focus and selected public text without a pointer log', () => {
    const element = visibleElement('unbounded text', { 'aria-label': 'Open Cropio' });
    element.closest.mockImplementation((selector) => selector.includes('button') ? element : selector === 'main, [data-site-context]' ? element : null);
    const selection = {
      anchorNode: { parentElement: element }, focusNode: { parentElement: element }, rangeCount: 1,
      getRangeAt: () => ({ cloneContents: () => ({ querySelector: () => null }) }),
      toString: () => '  selected\n  public text  ',
    };
    vi.stubGlobal('document', {
      activeElement: element,
      querySelectorAll: () => ({ length: 1, item: () => element }),
      getSelection: () => selection,
    });
    expect(readVoiceCurrentContext(['interaction'], { runtime })).toEqual({
      interaction: { selection: 'selected public text', hover: 'Open Cropio', focus: 'Open Cropio' },
    });
    selection.getRangeAt = () => ({ cloneContents: () => ({ querySelector: () => element as never }) });
    expect(readVoiceCurrentContext(['interaction'], { runtime })).toMatchObject({ interaction: { selection: null } });
  });

  it('does not report sticky touch hover as a cursor target', () => {
    const querySelectorAll = vi.fn(() => { throw new Error('Touch devices have no cursor to sample'); });
    vi.stubGlobal('document', {
      activeElement: null,
      defaultView: { matchMedia: () => ({ matches: false }) },
      querySelectorAll,
      getSelection: () => null,
    });
    expect(readVoiceCurrentContext(['interaction'], { runtime })).toEqual({
      interaction: { selection: null, hover: null, focus: null },
    });
    expect(querySelectorAll).not.toHaveBeenCalled();
  });

  it.each(['password', 'feedback-contact', 'terminal-input'])('does not expose selected text in %s', (field) => {
    const input = {
      ...visibleElement('', { 'data-voice-field': field }),
      value: 'private value', selectionStart: 0, selectionEnd: 13,
    };
    input.matches.mockReturnValue(true);
    vi.stubGlobal('document', {
      activeElement: input,
      querySelectorAll: () => ({ length: 0, item: () => null }),
    });
    expect(readVoiceCurrentContext(['interaction'], { runtime })).toMatchObject({ interaction: { selection: null } });
  });

  it('samples selected composer text freshly rather than repeating the entire draft', () => {
    const input = {
      ...visibleElement('', { 'data-voice-field': 'chat-composer' }),
      value: 'hello world', selectionStart: 6, selectionEnd: 11,
    };
    input.matches.mockReturnValue(true);
    vi.stubGlobal('document', { activeElement: input, querySelectorAll: () => ({ length: 0, item: () => null }) });
    expect(readVoiceCurrentContext(['interaction'], { runtime })).toMatchObject({ interaction: { selection: 'world' } });
    input.value = 'hello there';
    expect(readVoiceCurrentContext(['interaction'], { runtime })).toMatchObject({ interaction: { selection: 'there' } });
  });

  it('enriches deterministic navigate and project results without waiting on navigation', async () => {
    vi.stubGlobal('window', {
      location: { pathname: '/about', search: '' },
      dispatchEvent: () => true,
      open: vi.fn(),
    });

    await expect(executeSiteTool({
      id: 'nav-ctx',
      name: 'navigate_to',
      args: { path: '/projects' },
    }, runtime as never)).resolves.toMatchObject({
      ok: true,
      spokenText: 'Taking you there.',
      data: {
        pageContext: {
          route: '/projects',
          openProject: null,
        },
      },
    });

    await expect(executeSiteTool({
      id: 'open-ctx',
      name: 'open_project',
      args: { slug: 'cropio' },
    }, runtime as never)).resolves.toMatchObject({
      ok: true,
      data: {
        slug: 'cropio',
        pageContext: {
          route: '/projects',
          openProject: 'cropio',
        },
      },
    });

    expect(expectedPageContextAfterNavigate('/guestbook', {
      route: '/projects',
      topic: 'projects',
      openProject: 'cropio',
      theme: 'light',
    })).toEqual({
      route: '/guestbook',
      topic: 'guestbook',
      theme: 'light',
    });
    expect(expectedPageContextAfterOpenProject('cropio', { theme: 'dark' })).toEqual({
      route: '/projects',
      topic: 'projects',
      theme: 'dark',
      openProject: 'cropio',
    });
    expect(expectedPageContextAfterCloseProject({
      route: '/projects',
      topic: 'projects',
      openProject: 'cropio',
    })).toEqual({
      route: '/projects',
      topic: 'projects',
    });
    expect(withVoicePageContext({ ok: true, spokenText: 'Taking you there.' })).toEqual({
      ok: true,
      spokenText: 'Taking you there.',
      data: { pageContextRefreshRequired: true },
    });
    const closed = withVoicePageContext({ ok: true, spokenText: 'Closed.' }, {
      route: '/projects', topic: 'projects', theme: 'dark', volume: 70,
    });
    expect(closed.data).toEqual({ pageContext: { route: '/projects', openProject: null } });
    expect(JSON.stringify(closed).length).toBeLessThan(110);
  });
});
