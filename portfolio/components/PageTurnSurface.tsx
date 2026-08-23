"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import PageTurnSkeleton from '@/components/PageTurnSkeleton';
import {
  createPageTurnTransition,
  finishPageTurn,
  getPageTurnSnapshot,
  getServerPageTurnSnapshot,
  PAGE_TURN_NAVIGATION_EVENT,
  resolvePageTurnRoute,
  startPageTurn,
  subscribeToPageTurn,
  type PageTurnNavigationRequest,
} from '@/lib/pageTurn';
import { cn } from '@/lib/utils';

interface NavigationWatchdog {
  sequence: number;
  timeout: number;
}

const ROUTE_SCROLL_CLASSES =
  'min-h-0 min-w-0 max-w-full overflow-y-auto overflow-x-clip px-3 sm:px-5 md:px-12 pt-[var(--c-page-header-h)] pb-[var(--c-page-footer-h)] ruler-scrollbar';

export default function PageTurnSurface({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const transition = useSyncExternalStore(
    subscribeToPageTurn,
    getPageTurnSnapshot,
    getServerPageTurnSnapshot,
  );
  const routeScrollRef = useRef<HTMLDivElement>(null);
  const navigationWatchdogRef = useRef<NavigationWatchdog | null>(null);

  const clearNavigationWatchdog = useCallback((sequence?: number) => {
    const watchdog = navigationWatchdogRef.current;
    if (!watchdog || sequence !== undefined && watchdog.sequence !== sequence) return;
    window.clearTimeout(watchdog.timeout);
    navigationWatchdogRef.current = null;
  }, []);

  const startNavigationRequest = useCallback((request: PageTurnNavigationRequest) => {
    const url = new URL(request.href, window.location.href);
    if (url.origin !== window.location.origin) return false;

    const href = `${url.pathname}${url.search}${url.hash}`;
    const nextTransition = createPageTurnTransition(pathname, url.pathname);
    if (!nextTransition) {
      const leftoverSnapshot = getPageTurnSnapshot();
      if (leftoverSnapshot) finishPageTurn(leftoverSnapshot.sequence);
      clearNavigationWatchdog();
      router[request.mode](href);
      return true;
    }

    const existingSnapshot = getPageTurnSnapshot();
    if (existingSnapshot?.toPath === nextTransition.toPath) return true;
    if (existingSnapshot) finishPageTurn(existingSnapshot.sequence);
    clearNavigationWatchdog();

    startPageTurn(nextTransition);
    try {
      router[request.mode](href);
    } catch (error) {
      clearNavigationWatchdog();
      finishPageTurn(nextTransition.sequence);
      throw error;
    }
    const timeout = window.setTimeout(() => {
      if (navigationWatchdogRef.current?.sequence !== nextTransition.sequence) return;
      navigationWatchdogRef.current = null;
      finishPageTurn(nextTransition.sequence);
    }, 5_000);
    navigationWatchdogRef.current = { sequence: nextTransition.sequence, timeout };
    return true;
  }, [clearNavigationWatchdog, pathname, router]);

  useEffect(() => {
    const onNavigationRequest = (event: Event) => {
      const request = (event as CustomEvent<PageTurnNavigationRequest>).detail;
      if (request && startNavigationRequest(request)) event.preventDefault();
    };

    window.addEventListener(PAGE_TURN_NAVIGATION_EVENT, onNavigationRequest);
    return () => window.removeEventListener(PAGE_TURN_NAVIGATION_EVENT, onNavigationRequest);
  }, [startNavigationRequest]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) return;

      const target = event.target as { closest?: (selector: string) => HTMLAnchorElement | null } | null;
      const anchor = target?.closest?.('a[href]');
      if (
        !anchor
        || anchor.target && anchor.target !== '_self'
        || anchor.hasAttribute('download')
      ) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const href = `${url.pathname}${url.search}${url.hash}`;
      if (startNavigationRequest({ href, mode: 'push' })) event.preventDefault();
    };

    document.addEventListener('click', onDocumentClick, true);
    return () => document.removeEventListener('click', onDocumentClick, true);
  }, [startNavigationRequest]);

  useLayoutEffect(() => {
    if (routeScrollRef.current) routeScrollRef.current.scrollTop = 0;
  }, [pathname]);

  useEffect(() => () => {
    clearNavigationWatchdog();
  }, [clearNavigationWatchdog]);

  useEffect(() => {
    if (!transition || transition.toPath !== pathname) return;
    const timeout = window.setTimeout(() => {
      clearNavigationWatchdog(transition.sequence);
      finishPageTurn(transition.sequence);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [clearNavigationWatchdog, pathname, transition]);

  const destinationPath = transition && transition.toPath !== pathname
    ? transition.toPath
    : null;
  const showSkeleton = Boolean(destinationPath);
  const isChatRoute = pathname.startsWith('/chat');

  return (
    <div className="page-turn-stage relative h-full min-h-0 min-w-0 overflow-hidden isolate">
      <div
        ref={routeScrollRef}
        key={pathname}
        className={cn(
          'page-turn-layer page-turn-active relative z-10 h-full',
          isChatRoute
            ? 'min-h-0 min-w-0 max-w-full overflow-hidden p-0 pt-[var(--c-page-header-h)]'
            : ROUTE_SCROLL_CLASSES,
        )}
        data-page-turn-layer="active"
        data-route-scroll-container
      >
        <div className="page-turn-content relative z-10 h-full min-h-full min-w-0">
          {children}
        </div>
        {showSkeleton && destinationPath ? (
          <PageTurnSkeleton
            label={resolvePageTurnRoute(destinationPath).label}
            pathname={destinationPath}
          />
        ) : null}
      </div>
    </div>
  );
}