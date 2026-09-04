import { describe, expect, it } from 'vitest';
import { cn, pickRandom } from '@/lib/utils';

describe('cn utility', () => {
  it('combines class names', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('filters out falsy values', () => {
    expect(cn('base', false && 'hidden', null, undefined, 'active')).toBe('base active');
  });

  it('resolves conflicting tailwind classes via twMerge', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });
});

describe('pickRandom utility', () => {
  it('picks a single random item from an array', () => {
    const items = ['apple', 'banana', 'cherry'] as const;
    const picked = pickRandom(items);
    expect(items).toContain(picked);
  });

  it('returns undefined when picking a single item from an empty array', () => {
    expect(pickRandom([])).toBeUndefined();
  });

  it('picks N distinct items from an array', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const picked = pickRandom(items, 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    for (const item of picked) {
      expect(items).toContain(item);
    }
  });

  it('does not mutate the source array', () => {
    const items = Object.freeze([10, 20, 30, 40, 50]);
    const original = [...items];
    const picked = pickRandom(items, 3);
    expect(items).toEqual(original);
    expect(picked).toHaveLength(3);
  });

  it('handles boundary conditions for N', () => {
    const items = ['a', 'b', 'c'];
    expect(pickRandom(items, 0)).toEqual([]);
    expect(pickRandom(items, -2)).toEqual([]);
    expect(pickRandom([], 3)).toEqual([]);
  });

  it('returns all elements when N >= array length', () => {
    const items = ['x', 'y', 'z'];
    const picked = pickRandom(items, 10);
    expect(picked).toHaveLength(3);
    expect(new Set(picked)).toEqual(new Set(items));
  });

  it('produces a statistically uniform distribution across trials', () => {
    const items = ['A', 'B', 'C'] as const;
    const counts: Record<string, number> = { A: 0, B: 0, C: 0 };
    const trials = 3000;

    for (let i = 0; i < trials; i++) {
      const item = pickRandom(items);
      counts[item]++;
    }

    // Expected ~1000 each. Verify within reasonable statistical bound (800 - 1200).
    expect(counts.A).toBeGreaterThan(750);
    expect(counts.A).toBeLessThan(1250);
    expect(counts.B).toBeGreaterThan(750);
    expect(counts.B).toBeLessThan(1250);
    expect(counts.C).toBeGreaterThan(750);
    expect(counts.C).toBeLessThan(1250);
  });
});
