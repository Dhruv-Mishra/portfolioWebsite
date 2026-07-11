import { describe, expect, it, vi } from 'vitest';

vi.mock('web-haptics/react', () => ({
  useWebHaptics: vi.fn(),
}));

vi.mock('@/hooks/useSitePrefs', () => ({
  getSitePrefsSnapshot: () => ({ hapticsEnabled: true }),
}));

import { shouldAllowHaptics } from '@/lib/haptics';

describe('haptics preference gate', () => {
  it('blocks haptics when the persisted preference is disabled', () => {
    expect(shouldAllowHaptics({
      enabled: false,
      visibilityState: 'visible',
      interactionMode: 'touch',
      interactionAgeMs: 10,
    })).toBe(false);
  });

  it('preserves touch, pen, visibility, and recent-interaction requirements', () => {
    expect(shouldAllowHaptics({
      enabled: true,
      visibilityState: 'visible',
      interactionMode: 'touch',
      interactionAgeMs: 2500,
    })).toBe(true);
    expect(shouldAllowHaptics({
      enabled: true,
      visibilityState: 'visible',
      interactionMode: 'pen',
      interactionAgeMs: 20,
    })).toBe(true);
    expect(shouldAllowHaptics({
      enabled: true,
      visibilityState: 'hidden',
      interactionMode: 'touch',
      interactionAgeMs: 20,
    })).toBe(false);
    expect(shouldAllowHaptics({
      enabled: true,
      visibilityState: 'visible',
      interactionMode: 'mouse',
      interactionAgeMs: 20,
    })).toBe(false);
    expect(shouldAllowHaptics({
      enabled: true,
      visibilityState: 'visible',
      interactionMode: 'touch',
      interactionAgeMs: 2501,
    })).toBe(false);
  });
});