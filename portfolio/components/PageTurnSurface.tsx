"use client";

import { useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import {
  finishPageTurn,
  getPageTurnSnapshot,
  getServerPageTurnSnapshot,
  installPageTurnHistory,
  subscribeToPageTurn,
} from '@/lib/pageTurn';
import { cn } from '@/lib/utils';

export default function PageTurnSurface({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const transition = useSyncExternalStore(
    subscribeToPageTurn,
    getPageTurnSnapshot,
    getServerPageTurnSnapshot,
  );
  const activeTransition = transition?.toPath === pathname ? transition : null;

  useEffect(() => installPageTurnHistory(), []);

  useEffect(() => {
    if (!activeTransition) return;
    const timeout = window.setTimeout(
      () => finishPageTurn(activeTransition.sequence),
      800,
    );
    return () => window.clearTimeout(timeout);
  }, [activeTransition]);

  return (
    <div
      key={pathname}
      className={cn(
        'page-turn-surface h-full min-h-full min-w-0 isolate',
        activeTransition && 'animate-page-template-in',
      )}
      data-page-turn-direction={activeTransition?.direction}
      data-page-turn-distance={activeTransition?.distance}
      onAnimationEnd={(event) => {
        if (
          activeTransition
          && event.target === event.currentTarget
          && (event.animationName === 'pageTemplateTurnIn'
            || event.animationName === 'pageTemplateFadeIn')
        ) {
          finishPageTurn(activeTransition.sequence);
        }
      }}
    >
      <div className="relative z-10 h-full min-h-full min-w-0">
        {children}
      </div>
    </div>
  );
}