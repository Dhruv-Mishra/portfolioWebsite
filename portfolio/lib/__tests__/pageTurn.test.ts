import { describe, expect, it, vi } from 'vitest';
import {
  PAGE_TURN_ROUTES,
  PAGE_TURN_DURATION_BY_DISTANCE_MS,
  PageTurnHistoryTracker,
  createPageTurnTransition,
  finishPageTurn,
  getPageTurnSnapshot,
  getPageTurnDurationMs,
  installPageTurnHistory,
  normalizePageTurnPath,
  requestPageTurnNavigation,
  resolvePageTurnRoute,
  startPageTurn,
  subscribeToPageTurn,
} from '@/lib/pageTurn';

describe('page-turn route model', () => {
  it('falls back to the supplied router when no page-turn host accepts a request', () => {
    const push = vi.fn();
    const replace = vi.fn();

    requestPageTurnNavigation({ push, replace }, { href: '/projects', mode: 'push' });
    requestPageTurnNavigation({ push, replace }, { href: '/about', mode: 'replace' });

    expect(push).toHaveBeenCalledWith('/projects');
    expect(replace).toHaveBeenCalledWith('/about');
  });

  it('does not fall back after a mounted host accepts a navigation request', () => {
    const push = vi.fn();
    const replace = vi.fn();
    const originalWindow = globalThis.window;
    const onRequest = (event: Event) => event.preventDefault();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        dispatchEvent(event: Event) {
          onRequest(event);
          return !event.defaultPrevented;
        },
      },
    });

    requestPageTurnNavigation({ push, replace }, { href: '/projects', mode: 'push' });

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  });

  it('uses one shared, deliberately paced duration model', () => {
    expect(PAGE_TURN_DURATION_BY_DISTANCE_MS).toEqual({
      1: 680,
      2: 760,
      3: 840,
    });
    expect([1, 2, 3].map((distance) => (
      getPageTurnDurationMs(distance as 1 | 2 | 3)
    ))).toEqual([680, 760, 840]);
  });

  it('assigns a stable page number to every visible route and not found', () => {
    expect(PAGE_TURN_ROUTES.map(({ path, page }) => [path, page])).toEqual([
      ['/', 1],
      ['/projects', 2],
      ['/about', 3],
      ['/resume', 4],
      ['/chat', 5],
      ['/guestbook', 6],
      ['/stickers', 7],
      ['/matrix-notes', 8],
      ['/settings', 9],
      ['*', 10],
    ]);
  });

  it('normalizes query, hash, and trailing slash changes as the same route', () => {
    expect(normalizePageTurnPath('/projects/?view=grid#featured')).toBe('/projects');
    expect(createPageTurnTransition('/projects', '/projects/?view=grid#featured')).toBeNull();
  });

  it('uses route order for normal navigation and caps multi-page travel', () => {
    expect(createPageTurnTransition('/', '/projects')).toMatchObject({
      direction: 'forward',
      distance: 1,
      fromPage: 1,
      toPage: 2,
    });
    expect(createPageTurnTransition('/settings', '/matrix-notes')).toMatchObject({
      direction: 'backward',
      distance: 1,
    });
    expect(createPageTurnTransition('/', '/settings')).toMatchObject({
      direction: 'forward',
      distance: 3,
    });
    expect(createPageTurnTransition('/settings', '/')).toMatchObject({
      direction: 'backward',
      distance: 3,
    });
  });

  it('lets browser history direction override route order', () => {
    expect(createPageTurnTransition('/', '/settings', -1)).toMatchObject({
      direction: 'backward',
      distance: 3,
    });
    expect(createPageTurnTransition('/settings', '/', 1)).toMatchObject({
      direction: 'forward',
      distance: 3,
    });
  });

  it('uses deterministic parent and not-found fallbacks', () => {
    const nestedProject = resolvePageTurnRoute('/projects/private-case-study');
    const unknownA = resolvePageTurnRoute('/missing-a');
    const unknownAAgain = resolvePageTurnRoute('/missing-a');
    const unknownB = resolvePageTurnRoute('/missing-b');

    expect(nestedProject.page).toBe(2);
    expect(nestedProject.position).toBeGreaterThan(2);
    expect(unknownA.page).toBe(10);
    expect(unknownA.position).toBe(unknownAAgain.position);
    expect(unknownA.position).not.toBe(unknownB.position);
  });
});

describe('page-turn history state', () => {
  it('tracks push, replace, back, and forward indexes', () => {
    const tracker = new PageTurnHistoryTracker(4);
    expect(tracker.push()).toBe(5);
    expect(tracker.replace()).toBe(5);
    expect(tracker.pop(2)).toBe(-3);
    expect(tracker.pop(5)).toBe(3);
    expect(tracker.pop(undefined)).toBeUndefined();
    expect(tracker.pop(5)).toBeUndefined();
  });

  it('does not let an old completion clear a newer transition snapshot', () => {
    const first = createPageTurnTransition('/', '/projects');
    const second = createPageTurnTransition('/projects', '/settings');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    startPageTurn(first);
    startPageTurn(second);
    finishPageTurn(first!.sequence);
    expect(getPageTurnSnapshot()).toBe(second);
    finishPageTurn(second!.sequence);
    expect(getPageTurnSnapshot()).toBeNull();
  });

  it('publishes snapshots synchronously but notifies outside the history mutation', async () => {
    const notifications: Array<ReturnType<typeof getPageTurnSnapshot>> = [];
    const unsubscribe = subscribeToPageTurn(() => {
      notifications.push(getPageTurnSnapshot());
    });
    const transition = createPageTurnTransition('/', '/projects');

    startPageTurn(transition);
    expect(getPageTurnSnapshot()).toBe(transition);
    expect(notifications).toEqual([]);

    await Promise.resolve();
    expect(notifications).toEqual([transition]);

    unsubscribe();
    finishPageTurn(transition!.sequence);
    await Promise.resolve();
  });

  it('publishes push intent before the native history mutation can render the route', () => {
    const originalWindow = globalThis.window;
    let snapshotDuringMutation = null as ReturnType<typeof getPageTurnSnapshot>;
    const listeners = new Map<string, EventListenerOrEventListenerObject>();
    const windowMock = {
      location: {
        pathname: '/',
        href: 'https://page-turn.test/',
      },
      history: {
        state: null as unknown,
        pushState(data: unknown, _unused: string, url?: string | URL | null) {
          snapshotDuringMutation = getPageTurnSnapshot();
          this.state = data;
          if (url) {
            const nextUrl = new URL(url.toString(), windowMock.location.href);
            windowMock.location.pathname = nextUrl.pathname;
            windowMock.location.href = nextUrl.href;
          }
        },
        replaceState(data: unknown) {
          this.state = data;
        },
      },
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        listeners.set(type, listener);
      },
      removeEventListener(type: string) {
        listeners.delete(type);
      },
    };
    Object.defineProperty(globalThis, 'window', { configurable: true, value: windowMock });

    const uninstall = installPageTurnHistory();
    window.history.pushState({}, '', '/projects');

    expect(snapshotDuringMutation).toMatchObject({
      fromPath: '/',
      toPath: '/projects',
      direction: 'forward',
    });
    expect(getPageTurnSnapshot()).toBe(snapshotDuringMutation);

    uninstall();
    if (snapshotDuringMutation) finishPageTurn(snapshotDuringMutation.sequence);
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  });
});