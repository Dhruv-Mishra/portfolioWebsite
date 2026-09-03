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
);

describe('navigation pending destination contract', () => {
  it('activates tabs from the live pathname and lets Next Link prefetch destinations', () => {
    expect(navigation).not.toContain('prefetch={false}');
    expect(navigation).toContain('active={pathname === item.href}');
  });

  it('marks pending with framework useLinkStatus under each NavTab Link', () => {
    expect(navigation).toContain("import Link, { useLinkStatus } from 'next/link'");
    expect(navigation).toContain('function RoutePendingMarker()');
    expect(navigation).toContain('const { pending } = useLinkStatus()');
    expect(navigation).toContain('<span hidden data-route-navigation-pending />');
    expect(navigation).toContain('<RoutePendingMarker />');
  });

  it('owns shared route content and loading placeholder without local pending state', () => {
    expect(routeScrollSurface).toContain('data-route-scroll-content');
    expect(routeScrollSurface).toContain('data-route-loading-placeholder');
    expect(routeScrollSurface).toContain('<LoadingSpinner />');
  });

  it('swaps stale content for the placeholder with relational CSS', () => {
    expect(globalsCss).toContain('[data-route-loading-placeholder]');
    expect(globalsCss).toContain('[data-route-navigation-pending]');
    expect(globalsCss).toContain('[data-route-scroll-content]');
    expect(globalsCss).toContain('visibility: hidden');
    expect(loading).not.toContain('animate-[fadeIn_0.3s_ease-out]');
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-live="polite"');
    expect(loading).not.toContain('aria-busy');
  });
});
