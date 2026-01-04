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
    });

    // Create and inject GTM script
    const script = document.createElement('script');
    script.src = `https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`;
    script.async = true;
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!isAnalyticsEnabled()) return;

    // Defer GTM loading to reduce main-thread blocking
    // Use requestIdleCallback if available, fallback to setTimeout
    if ('requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback(loadGTM, { timeout: 5000 });
    } else {
      setTimeout(loadGTM, 4000);
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

