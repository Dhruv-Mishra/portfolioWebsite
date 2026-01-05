"use client";

import { useEffect, Suspense, useCallback, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { pageview, isAnalyticsEnabled } from '@/lib/analytics';

// Declare gtag on window for TypeScript
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function AnalyticsInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const gtmLoaded = useRef(false);

  const loadGTM = useCallback(() => {
    if (gtmLoaded.current || !process.env.NEXT_PUBLIC_GA_ID) return;
    gtmLoaded.current = true;

    // Initialize dataLayer
    window.dataLayer = window.dataLayer || [];
    const dataLayer = window.dataLayer;
    window.gtag = function gtag(...args: unknown[]) {
      dataLayer.push(args);
    };
    window.gtag('js', new Date());
    window.gtag('config', process.env.NEXT_PUBLIC_GA_ID, {
      page_path: window.location.pathname,
      // Optimize GA4 settings to reduce main thread work
      send_page_view: true,
      transport_type: 'beacon', // Use sendBeacon API for better performance
    });

    // Create and inject GTM script with lower priority
    const script = document.createElement('script');
    script.src = `https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`;
    script.async = true;
    script.defer = true; // Defer execution
    // Set low fetch priority to prevent blocking critical resources
    script.setAttribute('fetchpriority', 'low');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!isAnalyticsEnabled()) return;

    // Aggressively defer GTM loading to after page is fully interactive
    // Wait for LCP to complete and page to be idle
    const scheduleLoad = () => {
      // Use requestIdleCallback with a longer timeout to ensure page is truly idle
      if ('requestIdleCallback' in window) {
        (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
          .requestIdleCallback(loadGTM, { timeout: 8000 });
      } else {
        // Fallback: wait 6 seconds for slower devices
        setTimeout(loadGTM, 6000);
      }
    };

    // Only load after the page has had a chance to fully render
    if (document.readyState === 'complete') {
      // Add additional delay after load complete
      setTimeout(scheduleLoad, 2000);
    } else {
      window.addEventListener('load', () => setTimeout(scheduleLoad, 2000), { once: true });
    }
  }, [loadGTM]);

  useEffect(() => {
    if (!isAnalyticsEnabled()) return;

    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    pageview(url);
  }, [pathname, searchParams]);

  return null;
}

export function Analytics() {
  // Only render if GA_TRACKING_ID is set
  if (!process.env.NEXT_PUBLIC_GA_ID) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <AnalyticsInner />
    </Suspense>
  );
}

