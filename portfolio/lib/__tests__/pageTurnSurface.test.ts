import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PageTurnSurface from '@/components/PageTurnSurface';
import {
  createPageTurnTransition,
  finishPageTurn,
  getPageTurnSnapshot,
  PAGE_TURN_SKELETON_DELAY_MS,
  requestPageTurnNavigation,
  startPageTurn,
} from '@/lib/pageTurn';

let pathname = '/';
let reducedMotion = false;
let enhanceImmersion = true;
const push = vi.fn();
const replace = vi.fn();
const prefetch = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, replace, prefetch }),
}));

vi.mock('@/hooks/useEffectiveReducedMotion', () => ({
  useEffectiveReducedMotion: () => reducedMotion,
}));

vi.mock('@/hooks/useSitePrefs', () => ({
  useSitePrefs: () => ({ enhanceImmersion }),
}));

function RouteProbe({ label }: { label: string }) {
  return React.createElement('button', { id: 'route-action' }, label);
}

let clickListener: ((event: MouseEvent) => void) | null = null;
let navigationRequestListener: ((event: Event) => void) | null = null;

function routeLayer(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.find((node) => node.props['data-page-turn-layer'] === 'active');
}

function skeletonNodes(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAll((node) => node.props['data-page-turn-skeleton'] !== undefined);
}

function internalAnchor(path: string) {
  return {
    href: `https://page-turn.test${path}`,
    target: '',
    hasAttribute: () => false,
  } as unknown as HTMLAnchorElement;
}

function clickEvent(path: string) {
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    target: { closest: () => internalAnchor(path) },
  } as unknown as MouseEvent;
}

beforeEach(() => {
  pathname = '/';
  reducedMotion = false;
  enhanceImmersion = true;
  push.mockClear();
  replace.mockClear();
  prefetch.mockClear();
  clickListener = null;
  navigationRequestListener = null;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const history = {
    state: null as unknown,
    pushState(data: unknown) {
      this.state = data;
    },
    replaceState(data: unknown) {
      this.state = data;
    },
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      history,
      location: {
        pathname: '/',
        href: 'https://page-turn.test/',
        origin: 'https://page-turn.test',
      },
      addEventListener(type: string, listener: (event: Event) => void) {
        if (type === 'portfolio:page-turn-navigation') navigationRequestListener = listener;
      },
      removeEventListener(type: string, listener: (event: Event) => void) {
        if (type === 'portfolio:page-turn-navigation' && navigationRequestListener === listener) {
          navigationRequestListener = null;
        }
      },
      dispatchEvent(event: Event) {
        navigationRequestListener?.(event);
        return !event.defaultPrevented;
      },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      activeElement: null,
      addEventListener(type: string, listener: (event: MouseEvent) => void) {
        if (type === 'click') clickListener = listener;
      },
      removeEventListener(type: string, listener: (event: MouseEvent) => void) {
        if (type === 'click' && clickListener === listener) clickListener = null;
      },
      getElementById: vi.fn(),
    },
  });
});

afterEach(async () => {
  const transition = getPageTurnSnapshot();
  if (transition) finishPageTurn(transition.sequence);
  vi.useRealTimers();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'document');
  vi.restoreAllMocks();
});

describe('PageTurnSurface single-route lifecycle', () => {
  it('hides stale content immediately and delays the destination skeleton', async () => {
    vi.useFakeTimers();
    window.setTimeout = globalThis.setTimeout.bind(globalThis);
    window.clearTimeout = globalThis.clearTimeout.bind(globalThis);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(PageTurnSurface, null,
          React.createElement(RouteProbe, { label: 'Home route' })),
      );
    });

    await act(async () => {
      clickListener?.(clickEvent('/projects'));
      await Promise.resolve();
    });

    const layer = routeLayer(renderer);
    expect(layer.findByType('button').children).toEqual(['Home route']);
    expect(layer.props.className).toContain('hidden');
    expect(layer.props.className).not.toContain('animate-page-turn-forward-out');
    expect(skeletonNodes(renderer)).toHaveLength(0);
    expect(layer.findAll((node) => node.props['data-page-turn-skeleton'] !== undefined)).toHaveLength(0);
    expect(getPageTurnSnapshot()).toMatchObject({ toPath: '/projects' });
    expect(push).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith('/projects');
    expect(prefetch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAGE_TURN_SKELETON_DELAY_MS - 1);
    });
    expect(skeletonNodes(renderer)).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(skeletonNodes(renderer)).toHaveLength(1);

    await act(async () => renderer.unmount());
  });

  it('lets a later destination replace an in-flight page switch', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(PageTurnSurface, null, null));
    });

    const firstClick = clickEvent('/projects');
    const secondClick = clickEvent('/about');
    await act(async () => {
      clickListener?.(firstClick);
      clickListener?.(secondClick);
      await Promise.resolve();
    });

    expect(firstClick.preventDefault).toHaveBeenCalledOnce();
    expect(secondClick.preventDefault).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenNthCalledWith(1, '/projects');
    expect(push).toHaveBeenNthCalledWith(2, '/about');
    expect(replace).not.toHaveBeenCalled();
    expect(getPageTurnSnapshot()).toMatchObject({ toPath: '/about' });

    await act(async () => renderer.unmount());
  });

  it('does not finish a newer same-route transition during stale cleanup', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(PageTurnSurface, null, null));
    });
    await act(async () => {
      requestPageTurnNavigation({ push, replace }, { href: '/projects', mode: 'push' });
      await Promise.resolve();
    });

    const newerTransition = createPageTurnTransition('/', '/projects');
    startPageTurn(newerTransition);
    await act(async () => renderer.unmount());

    expect(getPageTurnSnapshot()).toBe(newerTransition);
    finishPageTurn(newerTransition!.sequence);
    await Promise.resolve();
  });

  it('releases the pending snapshot when the navigation watchdog expires', async () => {
    vi.useFakeTimers();
    window.setTimeout = globalThis.setTimeout.bind(globalThis);
    window.clearTimeout = globalThis.clearTimeout.bind(globalThis);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(PageTurnSurface, null, null));
    });
    await act(async () => {
      requestPageTurnNavigation({ push, replace }, { href: '/projects', mode: 'push' });
      await Promise.resolve();
    });

    expect(push).toHaveBeenCalledWith('/projects');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_001);
    });

    expect(getPageTurnSnapshot()).toBeNull();
    requestPageTurnNavigation({ push, replace }, { href: '/about', mode: 'replace' });
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith('/about');

    await act(async () => renderer.unmount());
  });

  it('cancels the delayed skeleton when the pathname commits quickly', async () => {
    vi.useFakeTimers();
    window.setTimeout = globalThis.setTimeout.bind(globalThis);
    window.clearTimeout = globalThis.clearTimeout.bind(globalThis);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(PageTurnSurface, null,
          React.createElement(RouteProbe, { label: 'Home route' })),
      );
    });

    await act(async () => {
      clickListener?.(clickEvent('/projects'));
      await Promise.resolve();
    });
    expect(routeLayer(renderer).props.className).toContain('hidden');
    expect(skeletonNodes(renderer)).toHaveLength(0);

    pathname = '/projects';
    await act(async () => {
      renderer.update(
        React.createElement(PageTurnSurface, null,
          React.createElement(RouteProbe, { label: 'Projects route' })),
      );
    });

    const active = routeLayer(renderer);
    expect(active.findByType('button').children).toEqual(['Projects route']);
    expect(active.props.className).not.toContain('hidden');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAGE_TURN_SKELETON_DELAY_MS);
    });
    expect(skeletonNodes(renderer)).toHaveLength(0);

    await act(async () => renderer.unmount());
  });

  it('clears a visible skeleton immediately when the pathname commits', async () => {
    vi.useFakeTimers();
    window.setTimeout = globalThis.setTimeout.bind(globalThis);
    window.clearTimeout = globalThis.clearTimeout.bind(globalThis);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(PageTurnSurface, null,
          React.createElement(RouteProbe, { label: 'Home route' })),
      );
    });
    await act(async () => {
      clickListener?.(clickEvent('/projects'));
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(PAGE_TURN_SKELETON_DELAY_MS);
    });
    expect(skeletonNodes(renderer)).toHaveLength(1);

    pathname = '/projects';
    await act(async () => {
      renderer.update(
        React.createElement(PageTurnSurface, null,
          React.createElement(RouteProbe, { label: 'Projects route' })),
      );
    });

    expect(routeLayer(renderer).props.className).not.toContain('hidden');
    expect(skeletonNodes(renderer)).toHaveLength(0);

    await act(async () => renderer.unmount());
  });

  it('lets a later programmatic destination replace a pending snapshot', async () => {
    pathname = '/projects';
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(PageTurnSurface, null, null));
    });

    const transition = createPageTurnTransition('/projects', '/', -1);
    startPageTurn(transition);
    await act(async () => {
      requestPageTurnNavigation({ push, replace }, { href: '/about', mode: 'replace' });
      await Promise.resolve();
    });

    expect(push).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith('/about');
    expect(getPageTurnSnapshot()).toMatchObject({ fromPath: '/projects', toPath: '/about' });

    await act(async () => renderer.unmount());
  });

  it('commits programmatic requests immediately with the requested mode', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(PageTurnSurface, null, null));
    });

    await act(async () => {
      requestPageTurnNavigation({ push, replace }, { href: '/projects', mode: 'replace' });
      await Promise.resolve();
    });

    expect(replace).toHaveBeenCalledWith('/projects');
    expect(getPageTurnSnapshot()).toMatchObject({ toPath: '/projects' });

    await act(async () => renderer.unmount());
  });

  it('commits programmatic backward requests immediately', async () => {
    pathname = '/projects';
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(PageTurnSurface, null, null));
    });

    await act(async () => {
      requestPageTurnNavigation({ push, replace }, { href: '/', mode: 'push' });
      await Promise.resolve();
    });
    expect(push).toHaveBeenCalledWith('/');
    expect(getPageTurnSnapshot()).toMatchObject({ direction: 'backward' });

    await act(async () => renderer.unmount());
  });

  it('releases transition state when an immediate router commit throws', async () => {
    pathname = '/projects';
    push.mockImplementationOnce(() => {
      throw new Error('backward navigation failed');
    });
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(PageTurnSurface, null, null));
    });

    expect(() => {
      requestPageTurnNavigation({ push, replace }, { href: '/', mode: 'push' });
    }).toThrow('backward navigation failed');
    expect(getPageTurnSnapshot()).toBeNull();

    await act(async () => renderer.unmount());
  });
});