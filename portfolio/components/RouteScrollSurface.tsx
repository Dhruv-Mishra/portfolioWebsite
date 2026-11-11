"use client";

import { ViewTransition, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { LoadingSpinner } from '@/components/Loading';
import { cn } from '@/lib/utils';

const ROUTE_SCROLL_CLASSES =
  'min-h-0 min-w-0 max-w-full overflow-y-auto overflow-x-clip px-3 sm:px-5 md:px-12 pt-[var(--c-page-header-h)] pb-[var(--c-page-footer-h)] ruler-scrollbar';

const PAGE_TURN_MAP = {
  'page-forward': 'sketchbook-turn-forward',
  'page-back': 'sketchbook-turn-back',
  default: 'none',
} as const;

export default function RouteScrollSurface({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isChatRoute = pathname.startsWith('/chat');

  return (
    <ViewTransition
      key={pathname}
      enter={PAGE_TURN_MAP}
      exit={PAGE_TURN_MAP}
      default="none"
    >
      <div
        className={cn(
          'relative z-10 h-full min-h-0',
          isChatRoute
            ? 'min-h-0 min-w-0 max-w-full overflow-hidden p-0 pt-[var(--c-page-header-h)]'
            : ROUTE_SCROLL_CLASSES,
        )}
        data-route-scroll-container
      >
        <div
          className="relative z-10 h-full min-h-full min-w-0"
          data-route-scroll-content
        >
          {children}
        </div>
        <div
          className="pointer-events-none absolute inset-0 z-20"
          data-route-loading-placeholder
        >
          <LoadingSpinner />
        </div>
      </div>
    </ViewTransition>
  );
}
