import { useEffect, useMemo, useState } from 'react';

export interface AppRouterInstance {
  back(): void;
  forward(): void;
  refresh(): void;
  push(href: string): void;
  replace(href: string): void;
  prefetch(href: string): void;
}

function currentPathname() {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname || '/';
}

function currentSearchParams() {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

export function usePathname() {
  const [pathname, setPathname] = useState(currentPathname);

  useEffect(() => {
    const update = () => setPathname(currentPathname());
    update();
    window.addEventListener('popstate', update);
    window.addEventListener('astro:page-load', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('astro:page-load', update);
    };
  }, []);

  return pathname;
}

export function useSearchParams() {
  const [params, setParams] = useState(currentSearchParams);

  useEffect(() => {
    const update = () => setParams(currentSearchParams());
    update();
    window.addEventListener('popstate', update);
    window.addEventListener('astro:page-load', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('astro:page-load', update);
    };
  }, []);

  return useMemo(() => params, [params]);
}

export function useRouter(): AppRouterInstance {
  return useMemo(() => ({
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    refresh: () => window.location.reload(),
    push: (href: string) => window.location.assign(href),
    replace: (href: string) => window.location.replace(href),
    prefetch: (href: string) => {
      if (typeof document === 'undefined') return;
      if (document.querySelector(`link[rel="prefetch"][href="${href}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      document.head.appendChild(link);
    },
  }), []);
}

export function notFound(): never {
  throw new Error('notFound() is not available in the Astro compatibility layer.');
}

export function redirect(href: string): never {
  if (typeof window !== 'undefined') window.location.assign(href);
  throw new Error(`redirect(${href}) is not available during Astro SSR.`);
}

export function useSelectedLayoutSegment() {
  const pathname = usePathname();
  return pathname.split('/').filter(Boolean)[0] ?? null;
}

export function useSelectedLayoutSegments() {
  const pathname = usePathname();
  return pathname.split('/').filter(Boolean);
}