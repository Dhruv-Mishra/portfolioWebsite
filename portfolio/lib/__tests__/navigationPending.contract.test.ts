import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const navigation = fs.readFileSync(
  path.join(process.cwd(), 'components', 'Navigation.tsx'),
  'utf8',
);
const routeScrollSurface = fs.readFileSync(
  path.join(process.cwd(), 'components', 'RouteScrollSurface.tsx'),
  'utf8',
);
const loading = fs.readFileSync(
  path.join(process.cwd(), 'components', 'Loading.tsx'),
  'utf8',
);
const globalsCss = fs.readFileSync(
  path.join(process.cwd(), 'app', 'globals.css'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('navigation pending destination contract', () => {
  it('activates tabs from the live pathname and lets Next Link prefetch destinations', () => {
    expect(navigation).not.toContain('subscribeToPageTurn');
    expect(navigation).not.toContain('getPageTurnSnapshot');
    expect(navigation).not.toContain('getServerPageTurnSnapshot');
    expect(navigation).not.toContain('useSyncExternalStore(');
    expect(navigation).not.toContain('prefetch={false}');
    expect(navigation).not.toContain('prefetch={item.prefetch}');
    expect(navigation).not.toContain('canWarmNoncriticalAssets');
    expect(navigation).not.toContain('router.prefetch');
    expect(navigation).not.toContain('useRouter');
    expect(navigation).not.toContain('3000');
    expect(navigation).toContain('active={pathname === item.href}');
  });

  it('marks pending with framework useLinkStatus under each NavTab Link', () => {
    expect(navigation).toContain("import Link, { useLinkStatus } from 'next/link'");
    expect(navigation).toContain('function RoutePendingMarker()');
    expect(navigation).toContain('const { pending } = useLinkStatus()');
    expect(navigation).toContain('<span hidden data-route-navigation-pending />');
    expect(navigation).toContain('<RoutePendingMarker />');
    expect(navigation).not.toContain('onNavigate');
    expect(navigation).not.toContain('useEffect');
    expect(navigation).not.toContain('setTimeout');
    expect(navigation).not.toContain('createPortal');
    expect(navigation).not.toContain('document.');
    expect(navigation).not.toContain('setPending');
    expect(navigation).not.toContain('isNavigating');
  });

  it('owns shared route content and loading placeholder without local pending state', () => {
    expect(routeScrollSurface).toContain('data-route-scroll-content');
    expect(routeScrollSurface).toContain('data-route-loading-placeholder');
    expect(routeScrollSurface).toContain('pointer-events-none');
    expect(routeScrollSurface).toContain('<LoadingSpinner />');
    expect(routeScrollSurface).toContain("import { LoadingSpinner } from '@/components/Loading'");
    expect(routeScrollSurface).not.toContain('useLinkStatus');
    expect(routeScrollSurface).not.toContain('useState(');
    expect(routeScrollSurface).not.toContain('useEffect');
  });

  it('swaps stale content for the placeholder with relational CSS', () => {
    expect(globalsCss).toContain('[data-route-loading-placeholder] {\n  display: none;\n}');
    expect(globalsCss).toContain('#main-content:has([data-route-navigation-pending]) [data-route-scroll-content] {\n  visibility: hidden;\n}');
    expect(globalsCss).toContain('#main-content:has([data-route-navigation-pending]) [data-route-loading-placeholder] {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}');
    expect(loading).not.toContain('animate-[fadeIn_0.3s_ease-out]');
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-live="polite"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('animate-spin motion-reduce:animate-none');
    expect(loading).toContain('animate-pulse motion-reduce:animate-none');
  });
});
