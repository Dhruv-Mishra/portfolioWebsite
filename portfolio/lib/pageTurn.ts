export type PageTurnDirection = 'forward' | 'backward';
export type PageTurnNavigationMode = 'push' | 'replace';

export interface PageTurnNavigationRequest {
  href: string;
  mode: PageTurnNavigationMode;
}

export interface PageTurnNavigationRouter {
  push: (href: string) => void;
  replace: (href: string) => void;
}

export const PAGE_TURN_NAVIGATION_EVENT = 'portfolio:page-turn-navigation';

export interface PageTurnRoute {
  path: string;
  label: string;
  page: number;
}

export interface PageTurnTransition {
  sequence: number;
  fromPath: string;
  toPath: string;
  fromPage: number;
  toPage: number;
  direction: PageTurnDirection;
  distance: 1 | 2 | 3;
}

export const PAGE_TURN_DURATION_BY_DISTANCE_MS = {
  1: 600,
  2: 680,
  3: 760,
} as const;

export function getPageTurnDurationMs(distance: PageTurnTransition['distance']) {
  return PAGE_TURN_DURATION_BY_DISTANCE_MS[distance];
}

export const PAGE_TURN_ROUTES: readonly PageTurnRoute[] = [
  { path: '/', label: 'Home', page: 1 },
  { path: '/projects', label: 'Projects', page: 2 },
  { path: '/about', label: 'About', page: 3 },
  { path: '/resume', label: 'Resume', page: 4 },
  { path: '/chat', label: 'Chat', page: 5 },
  { path: '/guestbook', label: 'Guestbook', page: 6 },
  { path: '/stickers', label: 'Stickers', page: 7 },
  { path: '/matrix-notes', label: 'Matrix Notes', page: 8 },
  { path: '/settings', label: 'Settings', page: 9 },
  { path: '*', label: 'Not Found', page: 10 },
] as const;

const NOT_FOUND_ROUTE = PAGE_TURN_ROUTES[PAGE_TURN_ROUTES.length - 1];
const HISTORY_INDEX_KEY = '__portfolioPageTurnIndex';
let transitionSequence = 0;
let snapshot: PageTurnTransition | null = null;
const listeners = new Set<() => void>();
let notificationQueued = false;

export function requestPageTurnNavigation(
  router: PageTurnNavigationRouter,
  request: PageTurnNavigationRequest,
) {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    const event = new CustomEvent<PageTurnNavigationRequest>(PAGE_TURN_NAVIGATION_EVENT, {
      bubbles: false,
      cancelable: true,
      detail: request,
    });
    window.dispatchEvent(event);
    if (event.defaultPrevented) return;
  }

  router[request.mode](request.href);
}

function notifyListeners() {
  if (notificationQueued) return;
  notificationQueued = true;
  queueMicrotask(() => {
    notificationQueued = false;
    listeners.forEach((listener) => listener());
  });
}

function stablePathFraction(pathname: string) {
  let hash = 0;
  for (let index = 0; index < pathname.length; index += 1) {
    hash = (hash * 31 + pathname.charCodeAt(index)) >>> 0;
  }
  return (hash % 997) / 1_000;
}

export function normalizePageTurnPath(path: string) {
  try {
    const pathname = new URL(path, 'https://page-turn.local').pathname;
    if (pathname === '/') return pathname;
    return pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '/';
  }
}

export function resolvePageTurnRoute(path: string) {
  const pathname = normalizePageTurnPath(path);
  const exactRoute = PAGE_TURN_ROUTES.find((route) => route.path === pathname);
  if (exactRoute) return { ...exactRoute, pathname, position: exactRoute.page };

  const parentRoute = PAGE_TURN_ROUTES.slice(1, -1).find(
    (route) => pathname.startsWith(`${route.path}/`),
  );
  if (parentRoute) {
    return {
      ...parentRoute,
      pathname,
      position: parentRoute.page + stablePathFraction(pathname),
    };
  }

  return {
    ...NOT_FOUND_ROUTE,
    pathname,
    position: NOT_FOUND_ROUTE.page + stablePathFraction(pathname),
  };
}

export function createPageTurnTransition(
  fromPath: string,
  toPath: string,
  historyDelta?: number,
): PageTurnTransition | null {
  const fromRoute = resolvePageTurnRoute(fromPath);
  const toRoute = resolvePageTurnRoute(toPath);
  if (fromRoute.pathname === toRoute.pathname) return null;

  const positionDelta = toRoute.position - fromRoute.position;
  const direction = historyDelta
    ? historyDelta > 0 ? 'forward' : 'backward'
    : positionDelta >= 0 ? 'forward' : 'backward';
  const routeDistance = Math.abs(toRoute.page - fromRoute.page);
  const travelDistance = Math.max(1, routeDistance, Math.abs(historyDelta ?? 0));

  return {
    sequence: ++transitionSequence,
    fromPath: fromRoute.pathname,
    toPath: toRoute.pathname,
    fromPage: fromRoute.page,
    toPage: toRoute.page,
    direction,
    distance: Math.min(3, travelDistance) as 1 | 2 | 3,
  };
}

export class PageTurnHistoryTracker {
  private currentIndex: number;

  constructor(initialIndex = 0) {
    this.currentIndex = initialIndex;
  }

  get index() {
    return this.currentIndex;
  }

  push() {
    this.currentIndex += 1;
    return this.currentIndex;
  }

  replace() {
    return this.currentIndex;
  }

  pop(targetIndex: number | undefined) {
    if (targetIndex === undefined || targetIndex === this.currentIndex) return undefined;

    const delta = targetIndex - this.currentIndex;
    this.currentIndex = targetIndex;
    return delta;
  }
}

export function startPageTurn(transition: PageTurnTransition | null) {
  if (!transition) return;
  snapshot = transition;
  notifyListeners();
}

export function subscribeToPageTurn(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPageTurnSnapshot() {
  return snapshot;
}

export function getServerPageTurnSnapshot() {
  return null;
}

export function finishPageTurn(sequence: number) {
  if (snapshot?.sequence !== sequence) return;
  snapshot = null;
  notifyListeners();
}

function stateWithHistoryIndex(state: unknown, index: number) {
  const objectState = state && typeof state === 'object' ? state : {};
  return { ...objectState, [HISTORY_INDEX_KEY]: index };
}

function historyIndexFromState(state: unknown) {
  if (!state || typeof state !== 'object') return undefined;
  const index = (state as Record<string, unknown>)[HISTORY_INDEX_KEY];
  return typeof index === 'number' && Number.isFinite(index) ? index : undefined;
}

let historyInstallCount = 0;
let removeHistoryTracking: (() => void) | null = null;

export function installPageTurnHistory() {
  if (typeof window === 'undefined') return () => undefined;
  historyInstallCount += 1;
  if (removeHistoryTracking) return uninstallPageTurnHistory;

  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;
  const initialIndex = historyIndexFromState(window.history.state) ?? 0;
  const tracker = new PageTurnHistoryTracker(initialIndex);
  let currentPath = normalizePageTurnPath(window.location.pathname);

  if (historyIndexFromState(window.history.state) === undefined) {
    originalReplaceState.call(
      window.history,
      stateWithHistoryIndex(window.history.state, initialIndex),
      '',
      window.location.href,
    );
  }

  const patchedPushState: History['pushState'] = function pushState(data, unused, url) {
    const fromPath = currentPath;
    const toPath = normalizePageTurnPath(
      url === undefined || url === null
        ? window.location.pathname
        : new URL(url.toString(), window.location.href).pathname,
    );
    const nextIndex = tracker.index + 1;
    const transition = createPageTurnTransition(fromPath, toPath);
    startPageTurn(transition);
    let result: ReturnType<History['pushState']>;
    try {
      result = originalPushState.call(
        window.history,
        stateWithHistoryIndex(data, nextIndex),
        unused,
        url,
      );
    } catch (error) {
      if (transition) finishPageTurn(transition.sequence);
      throw error;
    }
    tracker.push();
    currentPath = normalizePageTurnPath(window.location.pathname);
    return result;
  };
  window.history.pushState = patchedPushState;

  const patchedReplaceState: History['replaceState'] = function replaceState(data, unused, url) {
    const fromPath = currentPath;
    const toPath = normalizePageTurnPath(
      url === undefined || url === null
        ? window.location.pathname
        : new URL(url.toString(), window.location.href).pathname,
    );
    const transition = createPageTurnTransition(fromPath, toPath);
    startPageTurn(transition);
    let result: ReturnType<History['replaceState']>;
    try {
      result = originalReplaceState.call(
        window.history,
        stateWithHistoryIndex(data, tracker.replace()),
        unused,
        url,
      );
    } catch (error) {
      if (transition) finishPageTurn(transition.sequence);
      throw error;
    }
    currentPath = normalizePageTurnPath(window.location.pathname);
    return result;
  };
  window.history.replaceState = patchedReplaceState;

  const onPopState = (event: PopStateEvent) => {
    const fromPath = currentPath;
    const toPath = normalizePageTurnPath(window.location.pathname);
    const targetIndex = historyIndexFromState(event.state);
    const historyDelta = tracker.pop(targetIndex);
    currentPath = toPath;
    startPageTurn(createPageTurnTransition(fromPath, toPath, historyDelta));
  };
  window.addEventListener('popstate', onPopState, true);

  removeHistoryTracking = () => {
    window.removeEventListener('popstate', onPopState, true);
    if (window.history.pushState === patchedPushState) {
      window.history.pushState = originalPushState;
    }
    if (window.history.replaceState === patchedReplaceState) {
      window.history.replaceState = originalReplaceState;
    }
    removeHistoryTracking = null;
  };

  return uninstallPageTurnHistory;
}

function uninstallPageTurnHistory() {
  historyInstallCount = Math.max(0, historyInstallCount - 1);
  if (historyInstallCount === 0) removeHistoryTracking?.();
}