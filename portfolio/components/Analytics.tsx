"use client";

import { useEffect } from 'react';
import { SITE } from '@/lib/links';

// Public Web Analytics site token. Static pages are served with `no-transform`, which stops
// Cloudflare from auto-injecting its beacon, so load it here unless Cloudflare already did.
const CLOUDFLARE_BEACON = JSON.stringify({ token: 'd3e8218a588a410282395a43d9b3b098', spa: true });
const SITE_HOST = new URL(SITE.url).hostname;

export function Analytics() {
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
