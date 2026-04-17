/**
 * Unit tests for the sparkle particle system helpers.
 *
 * The canvas component itself needs a DOM to run, but the spawn/step/count
 * functions are pure and testable in node. These tests give us a guardrail
 * that the sparkle pipeline spawns valid particles at expected density and
 * that dead particles are reported as such (which drives the "respawn" path
 * in the component — the caller allocates a fresh particle on false).
 */
import { describe, it, expect } from 'vitest';
import {
  spawnParticle,
  stepParticle,
  particleCountForViewport,
  PARTICLE_COLORS,
} from '@/lib/discoSparkleUtils';

describe('spawnParticle', () => {
  it('returns a particle within expected ranges', () => {
    const p = spawnParticle(1200, 800, true);
    expect(['star', 'confetti', 'speck']).toContain(p.kind);
    expect(PARTICLE_COLORS).toContain(p.color);
    expect(p.life).toBeGreaterThanOrEqual(5);
    expect(p.life).toBeLessThanOrEqual(9);
    expect(p.maxLife).toBe(p.life);
    expect(p.vy).toBeGreaterThanOrEqual(18);
    expect(p.vy).toBeLessThanOrEqual(70);
  });

  it('fromTop=true spawns above the viewport', () => {
    for (let i = 0; i < 30; i++) {
      const p = spawnParticle(1200, 800, true);
      // Must be at or above y=0 (negative y == above the viewport).
      expect(p.y).toBeLessThanOrEqual(0);
    }
  });

  it('fromTop=false may spawn anywhere on the vertical axis', () => {
    let sawBelowTop = false;
    for (let i = 0; i < 50; i++) {
      const p = spawnParticle(1200, 800, false);
      if (p.y > 0) sawBelowTop = true;
    }
    expect(sawBelowTop).toBe(true);
  });

  it('size differs by kind', () => {
    const sizes = { star: [] as number[], confetti: [] as number[], speck: [] as number[] };
    for (let i = 0; i < 200; i++) {
      const p = spawnParticle(1200, 800, false);
      sizes[p.kind].push(p.size);
    }
    if (sizes.speck.length > 0) {
      expect(Math.max(...sizes.speck)).toBeLessThan(4);
    }
    if (sizes.star.length > 0) {
      expect(Math.max(...sizes.star)).toBeLessThanOrEqual(13);
    }
  });
});

describe('stepParticle', () => {
  it('reports false once life elapses', () => {
    const p = spawnParticle(1200, 800, false);
    p.life = 0.5;
    // Advance by more than its remaining life — should die.
    const alive = stepParticle(p, 1.0, 1200, 800);
    expect(alive).toBe(false);
  });

  it('reports false when falling past the viewport bottom', () => {
    const p = spawnParticle(1200, 800, false);
    p.y = 900;
    p.life = 100; // still plenty of life
    const alive = stepParticle(p, 0.01, 1200, 800);
    expect(alive).toBe(false);
  });

  it('advances position along velocity when alive', () => {
    const p = spawnParticle(1200, 800, false);
    p.x = 100;
    p.y = 100;
    p.vx = 10;
    p.vy = 20;
    p.life = 10;
    const originalX = p.x;
    const originalY = p.y;
    const alive = stepParticle(p, 0.5, 1200, 800);
    expect(alive).toBe(true);
    expect(p.y).toBeGreaterThan(originalY); // moved down
    // x has both vx and sin-drift, so just check it's reasonable.
    expect(Math.abs(p.x - originalX)).toBeLessThan(100);
  });
});

describe('particleCountForViewport', () => {
  it('caps desktop density at 92 regardless of viewport size', () => {
    const count = particleCountForViewport(3840, 2160, false);
    expect(count).toBeLessThanOrEqual(92);
  });

  it('caps mobile density at 34', () => {
    const count = particleCountForViewport(414, 896, true);
    expect(count).toBeLessThanOrEqual(34);
  });

  it('mobile density is strictly lower than desktop at the same viewport', () => {
    const desktop = particleCountForViewport(1440, 900, false);
    const mobile = particleCountForViewport(1440, 900, true);
    expect(mobile).toBeLessThan(desktop);
  });

  it('returns non-negative values on tiny viewports', () => {
    const count = particleCountForViewport(200, 400, true);
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
