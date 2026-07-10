import {
  classifyBuildChannel,
  PRODUCTION_URL,
  STAGING_URL,
} from '@/lib/buildChannel';

const EXPERIMENTAL_HANDOFF_PARAM = 'experimental-features';
const EXPERIMENTAL_RETURN_PARAM = 'experimental-return';
const EXPERIMENTAL_RETURN_VALUE = 'production';
const EXPERIMENTAL_RETURN_HISTORY_KEY = '__experimentalFeaturesReturned';

export interface ClientLocationParts {
  hostname: string;
  pathname: string;
  search: string;
  hash: string;
}

export type ExperimentalToggleIntent = 'confirm-enable' | 'disable' | 'none';

export interface ExperimentalFeaturesHandoff {
  enabled: boolean;
  intent: 'enable' | 'return';
  cleanPath: string;
}

export interface ExperimentalFeaturesReconcileOptions {
  enabled: boolean;
  location: ClientLocationParts;
  historyState: unknown;
  returnRecoveryHandled: boolean;
  setEnabled: (enabled: boolean) => boolean;
  replaceHistory: (state: unknown, cleanPath: string) => void;
  navigate: (destination: string) => void;
}

export type ExperimentalFeaturesReconcileResult =
  | 'enable-handoff'
  | 'return-handoff'
  | 'return-recovery'
  | 'redirect'
  | 'none';

export function readExperimentalFeaturesHistoryState(
  history: Pick<History, 'state'>,
): unknown {
  try {
    return history.state;
  } catch {
    return null;
  }
}

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

function toCanonicalUrl(origin: string, location: ClientLocationParts): URL {
  const destination = new URL(origin);
  destination.pathname = normalizePathname(location.pathname);
  destination.search = normalizeSuffix(location.search, '?');
  destination.hash = normalizeSuffix(location.hash, '#');
  return destination;
}

export function getExperimentalFeaturesRedirect(
  enabled: boolean,
  location: ClientLocationParts,
): string | null {
  if (!enabled || classifyBuildChannel(location.hostname).channel !== 'production') {
    return null;
  }

  if (getExperimentalFeaturesHandoff(location)?.intent === 'return') return null;

  const destination = toCanonicalUrl(STAGING_URL, location);
  destination.searchParams.set(EXPERIMENTAL_HANDOFF_PARAM, 'on');
  return destination.toString();
}

export function getExperimentalFeaturesHandoff(
  location: ClientLocationParts,
): ExperimentalFeaturesHandoff | null {
  const channel = classifyBuildChannel(location.hostname).channel;
  if (channel !== 'production' && channel !== 'staging') return null;

  const current = toCanonicalUrl(
    channel === 'production' ? PRODUCTION_URL : STAGING_URL,
    location,
  );

  if (
    channel === 'production'
    && current.searchParams.get(EXPERIMENTAL_RETURN_PARAM) === EXPERIMENTAL_RETURN_VALUE
  ) {
    current.searchParams.delete(EXPERIMENTAL_RETURN_PARAM);
    current.searchParams.delete(EXPERIMENTAL_HANDOFF_PARAM);
    return {
      enabled: false,
      intent: 'return',
      cleanPath: `${current.pathname}${current.search}${current.hash}`,
    };
  }

  if (
    channel !== 'staging'
    || current.searchParams.get(EXPERIMENTAL_HANDOFF_PARAM) !== 'on'
  ) return null;

  current.searchParams.delete(EXPERIMENTAL_HANDOFF_PARAM);
  return {
    enabled: true,
    intent: 'enable',
    cleanPath: `${current.pathname}${current.search}${current.hash}`,
  };
}

export function getExperimentalFeaturesReturnUrl(
  location: ClientLocationParts,
): string | null {
  if (classifyBuildChannel(location.hostname).channel !== 'staging') return null;

  const destination = toCanonicalUrl(PRODUCTION_URL, location);
  destination.searchParams.delete(EXPERIMENTAL_HANDOFF_PARAM);
  destination.searchParams.set(EXPERIMENTAL_RETURN_PARAM, EXPERIMENTAL_RETURN_VALUE);
  return destination.toString();
}

function hasReturnRecovery(state: unknown): boolean {
  return typeof state === 'object'
    && state !== null
    && !Array.isArray(state)
    && (state as Record<string, unknown>)[EXPERIMENTAL_RETURN_HISTORY_KEY] === true;
}

function updateReturnRecovery(
  state: unknown,
  enabled: boolean,
): Record<string, unknown> {
  const current = typeof state === 'object' && state !== null && !Array.isArray(state)
    ? state as Record<string, unknown>
    : {};
  const next = { ...current };
  if (enabled) next[EXPERIMENTAL_RETURN_HISTORY_KEY] = true;
  else delete next[EXPERIMENTAL_RETURN_HISTORY_KEY];
  return next;
}

function currentRelativeUrl(location: ClientLocationParts): string {
  const current = toCanonicalUrl(PRODUCTION_URL, location);
  return `${current.pathname}${current.search}${current.hash}`;
}

export function reconcileExperimentalFeatures({
  enabled,
  location,
  historyState,
  returnRecoveryHandled,
  setEnabled,
  replaceHistory,
  navigate,
}: ExperimentalFeaturesReconcileOptions): ExperimentalFeaturesReconcileResult {
  const handoff = getExperimentalFeaturesHandoff(location);
  if (handoff) {
    let persisted = false;
    try {
      persisted = setEnabled(handoff.enabled);
    } catch {
      persisted = false;
    }

    const nextHistoryState = handoff.intent === 'return'
      ? updateReturnRecovery(historyState, !persisted)
      : historyState;
    try {
      replaceHistory(nextHistoryState, handoff.cleanPath);
    } catch {
      // Retaining the fixed marker is safer than allowing a stale opt-in redirect.
    }
    return handoff.intent === 'return' ? 'return-handoff' : 'enable-handoff';
  }

  const isProduction = classifyBuildChannel(location.hostname).channel === 'production';
  if (
    isProduction
    && !returnRecoveryHandled
    && hasReturnRecovery(historyState)
  ) {
    let persisted = false;
    try {
      persisted = setEnabled(false);
    } catch {
      persisted = false;
    }
    if (persisted) {
      try {
        replaceHistory(updateReturnRecovery(historyState, false), currentRelativeUrl(location));
      } catch {
        // The in-memory preference is already disabled for this page load.
      }
    }
    return 'return-recovery';
  }

  const destination = getExperimentalFeaturesRedirect(enabled, location);
  if (!destination) return 'none';
  navigate(destination);
  return 'redirect';
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