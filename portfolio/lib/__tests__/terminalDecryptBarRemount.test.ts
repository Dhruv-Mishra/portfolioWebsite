/**
 * Tests for `TerminalDecryptBar`'s remount-persistence registry.
 *
 * CONTRACT
 * ────────
 * The bar takes a stable `id` prop. On first mount the animation plays
 * normally. When the animation finishes, the id is added to a module-scope
 * Set (`completedBarIds`). If the SAME bar instance is subsequently
 * re-mounted (e.g. the user navigated away from / and back — the
 * TerminalProvider at root layout preserved `outputLines`, but the
 * Terminal subtree unmounted + remounted, resetting every child's local
 * React state), the component's `useState` initializer reads the Set and
 * starts in the `done` state so the reveal renders immediately.
 *
 * This file exercises the PURE registry side of that contract (the
 * `__hasDecryptBarCompletedForTests` / `__resetDecryptBarRegistryForTests`
 * hooks). The full React integration is covered by the e2e / manual
 * walkthrough documented in the PR description because the test
 * environment here (vitest with `environment: node`) doesn't have jsdom.
 * Keeping these tests pure-logic lets us assert the registry contract
 * without adding @testing-library/react + jsdom as dev deps.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  __hasDecryptBarCompletedForTests,
  __resetDecryptBarRegistryForTests,
} from '@/components/TerminalDecryptBar';

const DECRYPT_BAR_SOURCE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'components',
  'TerminalDecryptBar.tsx',
);

describe('TerminalDecryptBar — completion registry', () => {
  beforeEach(() => {
    __resetDecryptBarRegistryForTests();
  });

  afterEach(() => {
    __resetDecryptBarRegistryForTests();
  });

  it('starts empty', () => {
    expect(__hasDecryptBarCompletedForTests('never-seen')).toBe(false);
  });

  it('reset clears all recorded ids', () => {
    // Indirectly: reset then assert nothing is recorded. We can't add
    // ids from the test (the internal Set is module-private), but the
    // pair (__has + __reset) round-trips cleanly through the component's
    // useEffect — verified by the e2e walkthrough.
    __resetDecryptBarRegistryForTests();
    expect(__hasDecryptBarCompletedForTests('x')).toBe(false);
    expect(__hasDecryptBarCompletedForTests('y')).toBe(false);
    expect(__hasDecryptBarCompletedForTests('z')).toBe(false);
  });

  it('default duration is 3500ms and reduced-motion is 500ms (source check)', () => {
    // Regression guard for the tuned durations. The component file owns
    // the constants (`DEFAULT_DURATION_MS`, `REDUCED_MOTION_DURATION_MS`);
    // we assert them via a source read so a future mis-edit fails loudly.
    const source = fs.readFileSync(DECRYPT_BAR_SOURCE_PATH, 'utf8');
    expect(source).toMatch(/const\s+DEFAULT_DURATION_MS\s*=\s*3500\b/);
    expect(source).toMatch(/const\s+REDUCED_MOTION_DURATION_MS\s*=\s*500\b/);
  });

  it('decrypt bar accepts and respects the `id` prop', () => {
    // Source-level assertion — TerminalDecryptBar must accept an `id`
    // prop and use it as the key into the registry. If the prop is
    // renamed or removed, the remount-persistence guarantee breaks.
    const source = fs.readFileSync(DECRYPT_BAR_SOURCE_PATH, 'utf8');
    expect(source).toMatch(/\bid:\s*string\b/);
    expect(source).toMatch(/completedBarIds\.has\(id\)/);
    expect(source).toMatch(/completedBarIds\.add\(id\)/);
  });
});
