import { describe, expect, it } from 'vitest';
import { resolveReducedMotion } from '@/hooks/useEffectiveReducedMotion';

describe('effective reduced motion', () => {
  it.each([
    ['system', false, false],
    ['system', true, true],
    ['reduced', false, true],
    ['reduced', true, true],
    ['full', false, false],
    ['full', true, false],
  ] as const)('%s with device=%s resolves to %s', (preference, device, expected) => {
    expect(resolveReducedMotion(preference, device)).toBe(expected);
  });
});