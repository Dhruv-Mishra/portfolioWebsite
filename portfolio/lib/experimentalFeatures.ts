import { classifyBuildChannel, STAGING_URL } from '@/lib/buildChannel';

const EXPERIMENTAL_HANDOFF_PARAM = 'experimental-features';

export interface ClientLocationParts {
  hostname: string;
  pathname: string;
  search: string;
  hash: string;
}

export type ExperimentalToggleIntent = 'confirm-enable' | 'disable' | 'none';

export function getExperimentalToggleIntent(
  currentlyEnabled: boolean,
  nextEnabled: boolean,
): ExperimentalToggleIntent {
  if (currentlyEnabled === nextEnabled) return 'none';
  return nextEnabled ? 'confirm-enable' : 'disable';
}

function normalizePathname(pathname: string): string {
  if (!pathname) return '/';
  return `/${pathname.replace(/^\/+/, '')}`;
}

function normalizeSuffix(value: string, marker: '?' | '#'): string {
  if (!value) return '';
  return value.startsWith(marker) ? value : `${marker}${value}`;
}

export function getExperimentalFeaturesRedirect(
  enabled: boolean,
  location: ClientLocationParts,
): string | null {
  if (!enabled || classifyBuildChannel(location.hostname).channel !== 'production') {
    return null;
  }

  const destination = new URL(STAGING_URL);
  destination.pathname = normalizePathname(location.pathname);
  destination.search = normalizeSuffix(location.search, '?');
  destination.searchParams.set(EXPERIMENTAL_HANDOFF_PARAM, 'on');
  destination.hash = normalizeSuffix(location.hash, '#');
  return destination.toString();
}

export function getExperimentalFeaturesHandoff(
  location: ClientLocationParts,
): string | null {
  if (classifyBuildChannel(location.hostname).channel !== 'staging') return null;

  const current = new URL(STAGING_URL);
  current.pathname = normalizePathname(location.pathname);
  current.search = normalizeSuffix(location.search, '?');
  current.hash = normalizeSuffix(location.hash, '#');
  if (current.searchParams.get(EXPERIMENTAL_HANDOFF_PARAM) !== 'on') return null;

  current.searchParams.delete(EXPERIMENTAL_HANDOFF_PARAM);
  return `${current.pathname}${current.search}${current.hash}`;
}

export function redirectToExperimentalFeatures(
  enabled: boolean,
  location: ClientLocationParts,
  navigate: (destination: string) => void,
): boolean {
  const destination = getExperimentalFeaturesRedirect(enabled, location);
  if (!destination) return false;
  navigate(destination);
  return true;
}