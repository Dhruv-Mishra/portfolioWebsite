import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeSiteTool } from '@/lib/siteToolExecutor';
import { parseSiteToolCall } from '@/lib/siteToolValidation';
import { SITE_TOOL_DECLARATIONS } from '@/lib/siteToolDeclarations';
import { parseVoiceClientSnapshot } from '@/lib/voiceClientSnapshot';
import {
  buildVoiceCurrentPageContext,
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

describe('get_current_page_context', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('declares and parses as a read-only empty-args tool', () => {
    expect(SITE_TOOL_DECLARATIONS.find(tool => tool.name === 'get_current_page_context')).toMatchObject({
      name: 'get_current_page_context',
      parameters: { type: 'object', properties: {} },
    });
    expect(parseSiteToolCall({
      name: 'get_current_page_context',
      args: {},
    })).toMatchObject({ name: 'get_current_page_context', args: {} });
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

  it('reads the live browser location from the executor', async () => {
    vi.stubGlobal('window', {
      location: { pathname: '/resume/', search: '' },
      dispatchEvent: () => true,
      open: vi.fn(),
    });

    await expect(executeSiteTool({
      id: 'ctx-live',
      name: 'get_current_page_context',
      args: {},
    }, runtime as never, { commit: false })).resolves.toMatchObject({
      ok: true,
      data: {
        pageContext: {
          route: '/resume',
          topic: 'resume',
          theme: 'light',
        },
      },
    });
    expect(runtime.router.push).not.toHaveBeenCalled();
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
          topic: 'projects',
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
          topic: 'projects',
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
  });
});
