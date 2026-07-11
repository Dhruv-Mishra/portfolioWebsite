import { describe, expect, it, vi } from 'vitest';
import {
  getExperimentalFeaturesHandoff,
  getExperimentalFeaturesRedirect,
  getExperimentalFeaturesReturnUrl,
  getExperimentalToggleIntent,
  readExperimentalFeaturesHistoryState,
  reconcileExperimentalFeatures,
  redirectToExperimentalFeatures,
} from '@/lib/experimentalFeatures';

const location = {
  hostname: 'whoisdhruv.com',
  pathname: '/settings',
  search: '?panel=appearance',
  hash: '#experiments',
};

describe('experimental features opt-in', () => {
  it('requires confirmation before a disabled preference can be enabled', () => {
    expect(getExperimentalToggleIntent(false, true)).toBe('confirm-enable');
    expect(getExperimentalToggleIntent(true, false)).toBe('disable');
    expect(getExperimentalToggleIntent(true, true)).toBe('none');
  });

  it('builds a canonical staging URL while preserving the current route', () => {
    expect(getExperimentalFeaturesRedirect(true, location)).toBe(
      'https://staging.whoisdhruv.com/settings?panel=appearance&experimental-features=on#experiments',
    );
  });

  it('consumes the opt-in handoff only on exact staging and restores the original route', () => {
    expect(getExperimentalFeaturesHandoff({
      hostname: 'staging.whoisdhruv.com',
      pathname: '/settings',
      search: '?panel=appearance&experimental-features=on',
      hash: '#experiments',
    })).toEqual({
      enabled: true,
      intent: 'enable',
      cleanPath: '/settings?panel=appearance#experiments',
    });

    expect(getExperimentalFeaturesHandoff({
      ...location,
      search: '?experimental-features=on',
    })).toBeNull();
    expect(getExperimentalFeaturesHandoff({
      ...location,
      hostname: 'preview.whoisdhruv.com',
      search: '?experimental-features=on',
    })).toBeNull();
  });

  it('ignores malformed staging handoff values', () => {
    expect(getExperimentalFeaturesHandoff({
      ...location,
      hostname: 'staging.whoisdhruv.com',
      search: '?experimental-features=yes',
    })).toBeNull();
  });

  it('builds and consumes an explicit staging-to-production return handoff', () => {
    const stagingLocation = {
      ...location,
      hostname: 'staging.whoisdhruv.com',
      search: '?panel=appearance&experimental-features=on',
    };

    expect(getExperimentalFeaturesReturnUrl(stagingLocation)).toBe(
      'https://whoisdhruv.com/settings?panel=appearance&experimental-return=production#experiments',
    );
    expect(getExperimentalFeaturesHandoff({
      ...location,
      search: '?panel=appearance&experimental-return=production',
    })).toEqual({
      enabled: false,
      intent: 'return',
      cleanPath: '/settings?panel=appearance#experiments',
    });
  });

  it('gives the production return marker precedence over a persisted opt-in', () => {
    const returningLocation = {
      ...location,
      search: '?panel=appearance&experimental-return=production',
    };

    expect(getExperimentalFeaturesHandoff(returningLocation)?.enabled).toBe(false);
    expect(getExperimentalFeaturesRedirect(true, returningLocation)).toBeNull();
  });

  it.each([
    'localhost',
    'preview.whoisdhruv.com',
    'example.com',
  ])('does not create or consume cross-origin handoffs on %s', (hostname) => {
    const untrustedLocation = {
      ...location,
      hostname,
      search: '?experimental-features=on&experimental-return=production',
    };

    expect(getExperimentalFeaturesHandoff(untrustedLocation)).toBeNull();
    expect(getExperimentalFeaturesReturnUrl(untrustedLocation)).toBeNull();
    expect(getExperimentalFeaturesRedirect(true, untrustedLocation)).toBeNull();
  });

  it('does not consume the return marker on staging or the enable marker on production', () => {
    expect(getExperimentalFeaturesHandoff({
      ...location,
      hostname: 'staging.whoisdhruv.com',
      search: '?experimental-return=production',
    })).toBeNull();
    expect(getExperimentalFeaturesHandoff({
      ...location,
      search: '?experimental-features=on',
    })).toBeNull();
  });

  it('runs the two-origin enable, disable, and explicit return lifecycle', () => {
    const setEnabled = vi.fn(() => true);
    const replaceHistory = vi.fn();
    const navigate = vi.fn();

    expect(reconcileExperimentalFeatures({
      enabled: true,
      location,
      historyState: null,
      returnRecoveryHandled: false,
      setEnabled,
      replaceHistory,
      navigate,
    })).toBe('redirect');
    expect(navigate).toHaveBeenLastCalledWith(
      'https://staging.whoisdhruv.com/settings?panel=appearance&experimental-features=on#experiments',
    );

    navigate.mockClear();
    expect(reconcileExperimentalFeatures({
      enabled: false,
      location: {
        ...location,
        hostname: 'staging.whoisdhruv.com',
        search: '?panel=appearance&experimental-features=on',
      },
      historyState: { route: 'settings' },
      returnRecoveryHandled: false,
      setEnabled,
      replaceHistory,
      navigate,
    })).toBe('enable-handoff');
    expect(setEnabled).toHaveBeenLastCalledWith(true);
    expect(replaceHistory).toHaveBeenLastCalledWith(
      { route: 'settings' },
      '/settings?panel=appearance#experiments',
    );

    expect(reconcileExperimentalFeatures({
      enabled: false,
      location: { ...location, hostname: 'staging.whoisdhruv.com' },
      historyState: null,
      returnRecoveryHandled: false,
      setEnabled,
      replaceHistory,
      navigate,
    })).toBe('none');
    expect(navigate).not.toHaveBeenCalled();

    expect(reconcileExperimentalFeatures({
      enabled: true,
      location: {
        ...location,
        search: '?panel=appearance&experimental-return=production',
      },
      historyState: { route: 'settings' },
      returnRecoveryHandled: false,
      setEnabled,
      replaceHistory,
      navigate,
    })).toBe('return-handoff');
    expect(setEnabled).toHaveBeenLastCalledWith(false);
    expect(replaceHistory).toHaveBeenLastCalledWith(
      { route: 'settings' },
      '/settings?panel=appearance#experiments',
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps a failed production clear stable across reload without throwing', () => {
    const replaceHistory = vi.fn();
    const navigate = vi.fn();
    const setEnabled = vi.fn(() => false);

    expect(() => reconcileExperimentalFeatures({
      enabled: true,
      location: { ...location, search: '?experimental-return=production' },
      historyState: null,
      returnRecoveryHandled: false,
      setEnabled,
      replaceHistory,
      navigate,
    })).not.toThrow();
    const recoveryState = replaceHistory.mock.calls[0][0];
    expect(recoveryState).toEqual({ __experimentalFeaturesReturned: true });

    expect(reconcileExperimentalFeatures({
      enabled: true,
      location: { ...location, search: '' },
      historyState: recoveryState,
      returnRecoveryHandled: false,
      setEnabled,
      replaceHistory,
      navigate,
    })).toBe('return-recovery');
    expect(navigate).not.toHaveBeenCalled();

    expect(reconcileExperimentalFeatures({
      enabled: true,
      location: { ...location, search: '' },
      historyState: recoveryState,
      returnRecoveryHandled: true,
      setEnabled: vi.fn(() => true),
      replaceHistory,
      navigate,
    })).toBe('redirect');
  });

  it('retains return recovery when storage and history fail before a retry', () => {
    const navigate = vi.fn();
    const failedReplace = vi.fn(() => {
      throw new DOMException('History unavailable');
    });

    expect(() => reconcileExperimentalFeatures({
      enabled: true,
      location: { ...location, search: '?experimental-return=production' },
      historyState: null,
      returnRecoveryHandled: false,
      setEnabled: vi.fn(() => false),
      replaceHistory: failedReplace,
      navigate,
    })).not.toThrow();
    expect(navigate).not.toHaveBeenCalled();

    const successfulReplace = vi.fn();
    expect(reconcileExperimentalFeatures({
      enabled: false,
      location: { ...location, search: '?experimental-return=production' },
      historyState: null,
      returnRecoveryHandled: true,
      setEnabled: vi.fn(() => false),
      replaceHistory: successfulReplace,
      navigate,
    })).toBe('return-handoff');
    expect(successfulReplace).toHaveBeenCalledWith(
      { __experimentalFeaturesReturned: true },
      '/settings#experiments',
    );

    expect(reconcileExperimentalFeatures({
      enabled: true,
      location: { ...location, search: '' },
      historyState: successfulReplace.mock.calls[0][0],
      returnRecoveryHandled: false,
      setEnabled: vi.fn(() => false),
      replaceHistory: vi.fn(),
      navigate,
    })).toBe('return-recovery');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('treats an unavailable history state as empty without throwing', () => {
    const history = Object.defineProperty({}, 'state', {
      get: () => {
        throw new DOMException('History unavailable');
      },
    });

    expect(readExperimentalFeaturesHistoryState(history as History)).toBeNull();
  });

  it('ignores return recovery state outside production', () => {
    const navigate = vi.fn();

    expect(reconcileExperimentalFeatures({
      enabled: true,
      location: { ...location, hostname: 'localhost', search: '' },
      historyState: { __experimentalFeaturesReturned: true },
      returnRecoveryHandled: false,
      setEnabled: vi.fn(() => true),
      replaceHistory: vi.fn(),
      navigate,
    })).toBe('none');
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    'staging.whoisdhruv.com',
    'localhost',
    'preview.whoisdhruv.com',
    'example.com',
  ])('does not redirect from non-production host %s', (hostname) => {
    expect(getExperimentalFeaturesRedirect(true, { ...location, hostname })).toBeNull();
  });

  it('does not redirect until the preference has been confirmed and persisted', () => {
    expect(getExperimentalFeaturesRedirect(false, location)).toBeNull();
  });

  it('navigates only when the redirect decision returns a destination', () => {
    const navigate = vi.fn();

    expect(redirectToExperimentalFeatures(true, location, navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledWith(
      'https://staging.whoisdhruv.com/settings?panel=appearance&experimental-features=on#experiments',
    );

    navigate.mockClear();
    expect(redirectToExperimentalFeatures(true, {
      ...location,
      hostname: 'staging.whoisdhruv.com',
    }, navigate)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('cannot be tricked into using a pathname as an alternate host', () => {
    expect(getExperimentalFeaturesRedirect(true, {
      ...location,
      pathname: '//malicious.example/settings',
    })).toBe('https://staging.whoisdhruv.com/malicious.example/settings?panel=appearance&experimental-features=on#experiments');
  });
});