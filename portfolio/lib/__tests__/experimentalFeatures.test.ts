import { describe, expect, it, vi } from 'vitest';
import {
  getExperimentalFeaturesHandoff,
  getExperimentalFeaturesRedirect,
  getExperimentalToggleIntent,
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

  it('consumes the opt-in handoff only on staging and restores the original route', () => {
    expect(getExperimentalFeaturesHandoff({
      hostname: 'staging.whoisdhruv.com',
      pathname: '/settings',
      search: '?panel=appearance&experimental-features=on',
      hash: '#experiments',
    })).toBe('/settings?panel=appearance#experiments');

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