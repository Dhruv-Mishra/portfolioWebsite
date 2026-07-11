import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PageTurnSurface from '@/components/PageTurnSurface';
import {
  createPageTurnTransition,
  finishPageTurn,
  getPageTurnSnapshot,
  requestPageTurnNavigation,
  startPageTurn,
} from '@/lib/pageTurn';

let pathname = '/';
let reducedMotion = false;
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

function RouteProbe({ label }: { label: string }) {
  return React.createElement('button', { id: 'route-action' }, label);
}

let clickListener: ((event: MouseEvent) => void) | null = null;
let navigationRequestListener: ((event: Event) => void) | null = null;

function routeLayer(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.find((node) => node.props['data-page-turn-layer'] === 'active');
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
  it('turns the current route before committing forward navigation', async () => {
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
    expect(layer.props.className).toContain('animate-page-turn-forward-out');
    expect(layer.props.inert).toBe(true);
    expect(prefetch).toHaveBeenCalledWith('/projects');
    expect(push).not.toHaveBeenCalled();

    await act(async () => {
      layer.props.onAnimationEnd({
        target: layer,
        currentTarget: layer,
        animationName: 'pageTurnForwardOut',
      });
    });

    expect(push).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith('/projects');

    await act(async () => renderer.unmount());
  });

  it('keeps the first target when two forward links are clicked synchronously', async () => {
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
    expect(prefetch).toHaveBeenCalledOnce();
    expect(prefetch).toHaveBeenCalledWith('/projects');

    const layer = routeLayer(renderer);
    await act(async () => {
      layer.props.onAnimationEnd({
        target: layer,
        currentTarget: layer,
        animationName: 'pageTurnForwardOut',
      });
    });

    expect(push).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith('/projects');
    expect(replace).not.toHaveBeenCalled();

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

    const layer = routeLayer(renderer);
    await act(async () => {
      layer.props.onAnimationEnd({
        target: layer,
        currentTarget: layer,
        animationName: 'pageTurnForwardOut',
      });
    });

    const newerTransition = createPageTurnTransition('/', '/projects');
    startPageTurn(newerTransition);
    await act(async () => renderer.unmount());

    expect(getPageTurnSnapshot()).toBe(newerTransition);
    finishPageTurn(newerTransition!.sequence);
    await Promise.resolve();
  });

  it('releases the forward lock when the navigation watchdog expires', async () => {
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

    const layer = routeLayer(renderer);
    await act(async () => {
      layer.props.onAnimationEnd({
        target: layer,
        currentTarget: layer,
        animationName: 'pageTurnForwardOut',
      });
      await vi.advanceTimersByTimeAsync(5_001);
    });

    expect(getPageTurnSnapshot()).toBeNull();
    expect(routeLayer(renderer).props.inert).toBeUndefined();
    requestPageTurnNavigation({ push, replace }, { href: '/about', mode: 'replace' });
    expect(prefetch).toHaveBeenCalledTimes(2);
    expect(prefetch).toHaveBeenLastCalledWith('/about');

    await act(async () => renderer.unmount());
  });

  it('animates the real incoming route from the left on backward navigation', async () => {
    pathname = '/projects';
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(PageTurnSurface, null,
          React.createElement(RouteProbe, { label: 'Projects route' })),
      );
    });

    const transition = createPageTurnTransition('/projects', '/', -1);
    startPageTurn(transition);
    pathname = '/';

    await act(async () => {
      renderer.update(
        React.createElement(PageTurnSurface, null,
          React.createElement(RouteProbe, { label: 'Home route' })),
      );
      await Promise.resolve();
    });

    const active = routeLayer(renderer);
    expect(active.findByType('button').children).toEqual(['Home route']);
    expect(active.props.className).toContain('animate-page-turn-backward-in');
    expect(active.props['data-page-turn-direction']).toBe('backward');
    expect(renderer.root.findAll((node) => node.props['data-page-turn-layer'])).toHaveLength(1);

    await act(async () => renderer.unmount());
  });

  it('consumes programmatic navigation while a backward turn is active', async () => {
    pathname = '/projects';
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(PageTurnSurface, null, null));
    });

    const transition = createPageTurnTransition('/projects', '/', -1);
    startPageTurn(transition);
    pathname = '/';
    await act(async () => {
      renderer.update(React.createElement(PageTurnSurface, null, null));
      await Promise.resolve();
    });

    expect(routeLayer(renderer).props.className).toContain('animate-page-turn-backward-in');
    await act(async () => {
      requestPageTurnNavigation({ push, replace }, { href: '/about', mode: 'replace' });
      await Promise.resolve();
    });

    expect(prefetch).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(getPageTurnSnapshot()).toBe(transition);

    await act(async () => renderer.unmount());
  });

  it('lets reduced-motion navigation commit without interception', async () => {
    reducedMotion = true;
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(PageTurnSurface, null,
          React.createElement(RouteProbe, { label: 'Home route' })),
      );
    });

    await act(async () => {
      const event = clickEvent('/projects');
      clickListener?.(event);
      expect(event.preventDefault).toHaveBeenCalled();
      await Promise.resolve();
    });

    expect(routeLayer(renderer).props.className).not.toContain('animate-page-turn-forward-out');
    expect(push).toHaveBeenCalledWith('/projects');

    await act(async () => renderer.unmount());
  });

  it('defers a programmatic forward request before committing with its requested mode', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(PageTurnSurface, null, null));
    });

    await act(async () => {
      requestPageTurnNavigation({ push, replace }, { href: '/projects', mode: 'replace' });
      await Promise.resolve();
    });

    const layer = routeLayer(renderer);
    expect(layer.props.className).toContain('animate-page-turn-forward-out');
    expect(replace).not.toHaveBeenCalled();

    await act(async () => {
      layer.props.onAnimationEnd({
        target: layer,
        currentTarget: layer,
        animationName: 'pageTurnForwardOut',
      });
    });

    expect(replace).toHaveBeenCalledWith('/projects');
    await act(async () => renderer.unmount());
  });

  it('commits programmatic backward and reduced-motion requests immediately', async () => {
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

    reducedMotion = true;
    await act(async () => {
      renderer.update(React.createElement(PageTurnSurface, null, null));
      await Promise.resolve();
    });
    await act(async () => {
      requestPageTurnNavigation({ push, replace }, { href: '/about', mode: 'replace' });
      await Promise.resolve();
    });
    expect(replace).toHaveBeenCalledWith('/about');

    await act(async () => renderer.unmount());
  });

  it('releases transition state when an immediate backward router commit throws', async () => {
    pathname = '/projects';
    push.mockImplementationOnce(() => {
      startPageTurn(createPageTurnTransition('/projects', '/'));
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

  it('releases the inert forward layer when its delayed router commit throws', async () => {
    push.mockImplementationOnce(() => {
      startPageTurn(createPageTurnTransition('/', '/projects'));
      throw new Error('forward navigation failed');
    });
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(PageTurnSurface, null, null));
    });
    await act(async () => {
      requestPageTurnNavigation({ push, replace }, { href: '/projects', mode: 'push' });
      await Promise.resolve();
    });

    const layer = routeLayer(renderer);
    let forwardError: unknown;
    await act(async () => {
      try {
        layer.props.onAnimationEnd({
          target: layer,
          currentTarget: layer,
          animationName: 'pageTurnForwardOut',
        });
      } catch (error) {
        forwardError = error;
      }
      await Promise.resolve();
    });

    expect(forwardError).toMatchObject({ message: 'forward navigation failed' });
    expect(getPageTurnSnapshot()).toBeNull();
    expect(routeLayer(renderer).props.inert).toBeUndefined();
    await act(async () => renderer.unmount());
  });
});