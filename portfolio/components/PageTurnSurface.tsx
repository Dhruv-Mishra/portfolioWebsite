"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type AnimationEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffectiveReducedMotion } from '@/hooks/useEffectiveReducedMotion';
import { useSitePrefs } from '@/hooks/useSitePrefs';
import {
  createPageTurnTransition,
  finishPageTurn,
  getPageTurnDurationMs,
  getPageTurnSnapshot,
  getServerPageTurnSnapshot,
  installPageTurnHistory,
  PAGE_TURN_NAVIGATION_EVENT,
  startPageTurn,
  subscribeToPageTurn,
  type PageTurnNavigationRequest,
  type PageTurnTransition,
} from '@/lib/pageTurn';
import { cn } from '@/lib/utils';

interface PendingForwardTurn {
  href: string;
  mode: PageTurnNavigationRequest['mode'];
  transition: PageTurnTransition;
  lockSequence: number;
}

interface IncomingTurn {
  transition: PageTurnTransition;
}

interface NavigationWatchdog {
  sequence: number;
  timeout: number;
}

interface NavigationLock {
  sequence: number;
  transition: PageTurnTransition;
  snapshotSequence: number;
}

function isSameNavigationTransition(
  first: PageTurnTransition,
  second: PageTurnTransition,
) {
  return first.fromPath === second.fromPath && first.toPath === second.toPath;
}

const ROUTE_SCROLL_CLASSES =
  'h-full min-h-full min-w-0 max-w-full overflow-y-auto overflow-x-clip px-3 py-6 sm:px-5 sm:py-8 md:p-12 ruler-scrollbar';

export default function PageTurnSurface({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const reducedMotion = useEffectiveReducedMotion();
  const { enhanceImmersion } = useSitePrefs();
  const pageTurnEnabled = enhanceImmersion && !reducedMotion;
  const transition = useSyncExternalStore(
    subscribeToPageTurn,
    getPageTurnSnapshot,
    getServerPageTurnSnapshot,
  );
  const [renderedPathname, setRenderedPathname] = useState(pathname);
  const [incomingTurn, setIncomingTurn] = useState<IncomingTurn | null>(null);
  const [pendingForward, setPendingForward] = useState<PendingForwardTurn | null>(null);
  const routeScrollRef = useRef<HTMLDivElement>(null);
  const navigationStartedRef = useRef(false);
  const navigationLockRef = useRef<NavigationLock | null>(null);
  const navigationWatchdogRef = useRef<NavigationWatchdog | null>(null);

  const releaseNavigationLock = useCallback((sequence: number) => {
    const lock = navigationLockRef.current;
    if (lock?.sequence !== sequence) return;

    navigationLockRef.current = null;
    const activeSnapshot = getPageTurnSnapshot();
    if (activeSnapshot?.sequence === lock.snapshotSequence) {
      finishPageTurn(activeSnapshot.sequence);
    }
  }, []);

  const adoptNavigationSnapshot = useCallback((sequence: number) => {
    const lock = navigationLockRef.current;
    if (lock?.sequence !== sequence) return;

    const activeSnapshot = getPageTurnSnapshot();
    if (
      activeSnapshot?.fromPath === lock.transition.fromPath
      && activeSnapshot.toPath === lock.transition.toPath
    ) {
      lock.snapshotSequence = activeSnapshot.sequence;
    }
  }, []);

  const clearNavigationWatchdog = useCallback((sequence?: number) => {
    const watchdog = navigationWatchdogRef.current;
    if (!watchdog || sequence !== undefined && watchdog.sequence !== sequence) return;
    window.clearTimeout(watchdog.timeout);
    navigationWatchdogRef.current = null;
  }, []);

  const settleDisabledPageTurnState = useCallback(() => {
    clearNavigationWatchdog();
    navigationStartedRef.current = false;
    navigationLockRef.current = null;
    setPendingForward(null);
    setIncomingTurn(null);

    const activeSnapshot = getPageTurnSnapshot();
    if (activeSnapshot) finishPageTurn(activeSnapshot.sequence);
  }, [clearNavigationWatchdog]);

  if (renderedPathname !== pathname) {
    const currentSnapshot = getPageTurnSnapshot();
    const intentTransition = currentSnapshot?.fromPath === renderedPathname
      && currentSnapshot.toPath === pathname
      ? currentSnapshot
      : null;
    const nextTransition = intentTransition
      ?? createPageTurnTransition(renderedPathname, pathname);

    setRenderedPathname(pathname);
    if (nextTransition?.direction === 'backward' && pageTurnEnabled) {
      setIncomingTurn({ transition: nextTransition });
    } else {
      setIncomingTurn(null);
    }
  }

  const forwardTurn = pageTurnEnabled
    && pendingForward?.transition.fromPath === pathname
    ? pendingForward.transition
    : null;
  const backwardTurn = pageTurnEnabled ? incomingTurn?.transition ?? null : null;
  const activeTransition = forwardTurn ?? backwardTurn;
  const durationMs = activeTransition
    ? getPageTurnDurationMs()
    : 0;

  useEffect(() => {
    let uninstallHistory: () => void = () => undefined;
    const timeout = window.setTimeout(() => {
      uninstallHistory = installPageTurnHistory();
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      clearNavigationWatchdog();
      const lockSequence = navigationLockRef.current?.sequence;
      if (lockSequence !== undefined) releaseNavigationLock(lockSequence);
      uninstallHistory();
    };
  }, [clearNavigationWatchdog, releaseNavigationLock]);

  useLayoutEffect(() => {
    if (!backwardTurn) return;

    const currentLock = navigationLockRef.current;
    if (currentLock && isSameNavigationTransition(currentLock.transition, backwardTurn)) {
      adoptNavigationSnapshot(currentLock.sequence);
      return;
    }

    clearNavigationWatchdog();
    const lockSequence = backwardTurn.sequence;
    navigationLockRef.current = {
      sequence: lockSequence,
      transition: backwardTurn,
      snapshotSequence: backwardTurn.sequence,
    };
    adoptNavigationSnapshot(lockSequence);
  }, [adoptNavigationSnapshot, backwardTurn, clearNavigationWatchdog]);

  const startNavigationRequest = useCallback((request: PageTurnNavigationRequest) => {
    const url = new URL(request.href, window.location.href);
    if (url.origin !== window.location.origin) return false;

    const href = `${url.pathname}${url.search}${url.hash}`;
    if (!pageTurnEnabled) {
      settleDisabledPageTurnState();
      router[request.mode](href);
      return true;
    }

    if (
      navigationLockRef.current !== null
      || pendingForward
      || incomingTurn
      || getPageTurnSnapshot()
    ) return true;

    const nextTransition = createPageTurnTransition(pathname, url.pathname);
    if (!nextTransition) {
      router[request.mode](href);
      return true;
    }

    const lockSequence = nextTransition.sequence;
    navigationLockRef.current = {
      sequence: lockSequence,
      transition: nextTransition,
      snapshotSequence: nextTransition.sequence,
    };
    startPageTurn(nextTransition);
    if (nextTransition.direction === 'backward') {
      try {
        router[request.mode](href);
      } catch (error) {
        adoptNavigationSnapshot(lockSequence);
        releaseNavigationLock(lockSequence);
        throw error;
      }
      adoptNavigationSnapshot(lockSequence);
      const timeout = window.setTimeout(() => {
        if (navigationWatchdogRef.current?.sequence !== lockSequence) return;
        navigationWatchdogRef.current = null;
        finishPageTurn(nextTransition.sequence);
        releaseNavigationLock(lockSequence);
      }, 5_000);
      navigationWatchdogRef.current = { sequence: lockSequence, timeout };
      return true;
    }

    const routeScrollContainer = routeScrollRef.current;
    if (
      routeScrollContainer
      && document.activeElement
      && routeScrollContainer.contains(document.activeElement)
    ) {
      document.getElementById('main-content')?.focus({ preventScroll: true });
    }

    try {
      router.prefetch(href);
    } catch (error) {
      finishPageTurn(nextTransition.sequence);
      releaseNavigationLock(lockSequence);
      throw error;
    }
    setPendingForward({
      href,
      mode: request.mode,
      transition: nextTransition,
      lockSequence,
    });
    return true;
  }, [
    adoptNavigationSnapshot,
    incomingTurn,
    pathname,
    pendingForward,
    pageTurnEnabled,
    releaseNavigationLock,
    router,
    settleDisabledPageTurnState,
  ]);

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

  const commitForwardNavigation = useCallback(() => {
    if (!pendingForward || navigationStartedRef.current) return;
    navigationStartedRef.current = true;
    try {
      router[pendingForward.mode](pendingForward.href);
    } catch (error) {
      adoptNavigationSnapshot(pendingForward.lockSequence);
      setPendingForward((current) => (
        current?.transition.sequence === pendingForward.transition.sequence
          ? null
          : current
      ));
      navigationStartedRef.current = false;
      finishPageTurn(pendingForward.transition.sequence);
      releaseNavigationLock(pendingForward.lockSequence);
      throw error;
    }
    adoptNavigationSnapshot(pendingForward.lockSequence);
    const timeout = window.setTimeout(() => {
      if (navigationWatchdogRef.current?.sequence !== pendingForward.lockSequence) return;
      setPendingForward((current) => (
        current?.transition.sequence === pendingForward.transition.sequence
          ? null
          : current
      ));
      navigationStartedRef.current = false;
      navigationWatchdogRef.current = null;
      finishPageTurn(pendingForward.transition.sequence);
      releaseNavigationLock(pendingForward.lockSequence);
    }, 5_000);
    navigationWatchdogRef.current = {
      sequence: pendingForward.lockSequence,
      timeout,
    };
  }, [adoptNavigationSnapshot, pendingForward, releaseNavigationLock, router]);

  useEffect(() => {
    if (!forwardTurn) return;
    const timeout = window.setTimeout(commitForwardNavigation, durationMs);
    return () => window.clearTimeout(timeout);
  }, [commitForwardNavigation, durationMs, forwardTurn]);

  useEffect(() => {
    if (!backwardTurn || !incomingTurn) return;
    const lock = navigationLockRef.current;
    const lockSequence = lock && isSameNavigationTransition(lock.transition, backwardTurn)
      ? lock.sequence
      : null;
    const timeout = window.setTimeout(() => {
      setIncomingTurn((current) => (
        current?.transition.sequence === backwardTurn.sequence ? null : current
      ));
      if (lockSequence !== null) clearNavigationWatchdog(lockSequence);
      finishPageTurn(backwardTurn.sequence);
      if (lockSequence !== null) releaseNavigationLock(lockSequence);
    }, getPageTurnDurationMs());
    return () => window.clearTimeout(timeout);
  }, [backwardTurn, clearNavigationWatchdog, incomingTurn, releaseNavigationLock]);

  useEffect(() => {
    if (!pendingForward || pendingForward.transition.fromPath === pathname) return;
    const timeout = window.setTimeout(() => {
      clearNavigationWatchdog(pendingForward.lockSequence);
      setPendingForward((current) => (
        current?.transition.sequence === pendingForward.transition.sequence
          ? null
          : current
      ));
      navigationStartedRef.current = false;
      finishPageTurn(pendingForward.transition.sequence);
      releaseNavigationLock(pendingForward.lockSequence);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [clearNavigationWatchdog, pathname, pendingForward, releaseNavigationLock]);

  useEffect(() => {
    if (
      transition?.toPath !== pathname
      || transition.direction === 'backward'
      || forwardTurn
    ) return;
    const timeout = window.setTimeout(() => finishPageTurn(transition.sequence), 0);
    return () => window.clearTimeout(timeout);
  }, [forwardTurn, pathname, transition]);

  useEffect(() => {
    if (pageTurnEnabled) return;

    const timeout = window.setTimeout(settleDisabledPageTurnState, 0);
    return () => window.clearTimeout(timeout);
  }, [
    pageTurnEnabled,
    settleDisabledPageTurnState,
  ]);

  const finishActiveTransition = (event: AnimationEvent<HTMLDivElement>) => {
    if (
      activeTransition
      && event.target === event.currentTarget
      && (event.animationName === 'pageTurnForwardOut'
        || event.animationName === 'pageTurnForwardFadeOut'
        || event.animationName === 'pageTurnBackwardIn'
        || event.animationName === 'pageTurnBackwardFadeIn')
    ) {
      if (forwardTurn) {
        commitForwardNavigation();
      } else {
        setIncomingTurn(null);
        const lock = navigationLockRef.current;
        if (lock && isSameNavigationTransition(lock.transition, activeTransition)) {
          clearNavigationWatchdog(lock.sequence);
          releaseNavigationLock(lock.sequence);
        }
        finishPageTurn(activeTransition.sequence);
      }
    }
  };

  const turnStyle = activeTransition
    ? { '--page-turn-duration': `${durationMs}ms` } as CSSProperties
    : undefined;
  const activeIsIncoming = Boolean(backwardTurn);
  const activeIsOutgoing = Boolean(forwardTurn);
  const turning = activeIsIncoming || activeIsOutgoing;

  return (
    <div className="page-turn-stage relative h-full min-h-0 min-w-0 overflow-hidden isolate">
      <div
        ref={routeScrollRef}
        key={pathname}
        className={cn(
          'page-turn-layer page-turn-active relative z-10',
          ROUTE_SCROLL_CLASSES,
          !pathname.startsWith('/chat') && 'pb-[var(--c-mobile-dock-clearance)] md:pb-0',
          activeIsIncoming && 'animate-page-turn-backward-in',
          activeIsOutgoing && 'animate-page-turn-forward-out',
        )}
        data-page-turn-layer="active"
        data-route-scroll-container
        data-page-turn-direction={activeTransition?.direction}
        data-page-turn-distance={activeTransition?.distance}
        style={turnStyle}
        aria-busy={turning || undefined}
        inert={turning || undefined}
        onAnimationEnd={turning ? finishActiveTransition : undefined}
      >
        <div className="page-turn-content relative z-10 h-full min-h-full min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}