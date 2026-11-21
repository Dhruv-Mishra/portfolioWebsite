"use client";

import { lazy, Suspense, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { RouteLoadingIndicator } from '@/components/Loading';
import { useSitePrefs } from '@/hooks/useSitePrefs';
import { cn } from '@/lib/utils';

const ROUTE_SCROLL_CLASSES =
  'min-h-0 min-w-0 max-w-full overflow-y-auto overflow-x-clip px-3 sm:px-5 md:pl-12 md:pr-[var(--c-rail-gutter)] pt-[var(--c-page-header-h)] pb-[var(--c-page-footer-h)] ruler-scrollbar';

const PageFlipTransition = lazy(() => import('@/components/PageFlipTransition'));

/** Room to finish a page: a pencil flourish, then air above the dock. */
const PAGE_END = (
  <div className="page-end" aria-hidden="true">
    <svg viewBox="0 0 160 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 14c14-8 22 8 36 0s22-8 36 0 22 8 36 0 22-8 30-2" />
      <path d="M150 8l6 4-6 5" />
    </svg>
  </div>
);

export default function RouteScrollSurface({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { pageFlipEnabled } = useSitePrefs();
  const isChatRoute = pathname.startsWith('/chat');

  const surface = (
    // Keyed by route so each page mounts a fresh scroll container at the top.
    <div
      key={pathname}
      className={cn(
        'relative z-10 h-full min-h-0',
        isChatRoute
          // At 75rem the centred 300px underline clears the 390px tab rail, its 3rem inset and focus ring.
          ? 'min-h-0 min-w-0 max-w-full overflow-hidden p-0 pt-[var(--c-page-header-h)] min-[75rem]:pt-[max(1rem,env(safe-area-inset-top))]'
          : ROUTE_SCROLL_CLASSES,
      )}
      data-route-scroll-container
    >
      <div
        className="relative z-10 h-full min-h-full min-w-0"
        data-route-scroll-content
      >
        {children}
        {isChatRoute ? null : PAGE_END}
      </div>
      <div
        className="pointer-events-none absolute inset-0 z-20"
        data-route-loading-placeholder
      >
        <RouteLoadingIndicator />
      </div>
    </div>
  );

  if (!pageFlipEnabled) return surface;

  return (
    <Suspense fallback={surface}>
      <PageFlipTransition pathname={pathname}>{surface}</PageFlipTransition>
    </Suspense>
  );
}
