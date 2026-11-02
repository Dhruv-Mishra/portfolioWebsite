"use client";

import { Suspense, useEffect } from 'react';
import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { pageview, isAnalyticsEnabled } from '@/lib/analytics';
import { SITE } from '@/lib/links';

// Public Web Analytics site token. Static pages are served with `no-transform`, which stops
// Cloudflare from auto-injecting its beacon, so load it here unless Cloudflare already did.
const CLOUDFLARE_BEACON = JSON.stringify({ token: 'd3e8218a588a410282395a43d9b3b098', spa: true });
const SITE_HOST = new URL(SITE.url).hostname;

function CloudflareWebAnalytics() {
  useEffect(() => {
    const { hostname } = window.location;
    const onSite = hostname === SITE_HOST || hostname.endsWith(`.${SITE_HOST}`);
    if (!onSite || document.querySelector('script[data-cf-beacon]')) return;

    const load = () => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
      script.dataset.cfBeacon = CLOUDFLARE_BEACON;
      document.body.appendChild(script);
    };
    if (document.readyState === 'complete') load();
    else window.addEventListener('load', load, { once: true });
    return () => window.removeEventListener('load', load);
  }, []);

  return null;
}

function AnalyticsInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isAnalyticsEnabled()) return;
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    pageview(url);
  }, [pathname, searchParams]);

  if (!process.env.NEXT_PUBLIC_GA_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
        strategy="lazyOnload"
      />
      <Script id="google-analytics" strategy="lazyOnload">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', {
            page_path: window.location.pathname,
          });
        `}
      </Script>
    </>
  );
}

export function Analytics() {
  return (
    <>
      <Suspense fallback={null}>
        <AnalyticsInner />
      </Suspense>
      <CloudflareWebAnalytics />
    </>
  );
}

