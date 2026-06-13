/**
 * discoSparkleUtils — pure particle factory + step functions extracted from
 * DiscoSparkleCanvas so they can be exercised in a node test environment
 * without requiring a DOM canvas. The canvas component imports these and
 * keeps the rAF loop + draw logic (which can only be unit-tested in jsdom).
 */

export type ParticleKind = 'star' | 'confetti' | 'speck';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  rot: number;
  vRot: number;
  size: number;
  color: string;
  kind: ParticleKind;
  drift: number;
  driftSpeed: number;
  phase: number;
}

export const PARTICLE_COLORS: readonly string[] = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b',
];

function rand(min: number, max: number, rng: () => number = Math.random): number {
  return min + rng() * (max - min);
}

function pick<T>(arr: readonly T[], rng: () => number = Math.random): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function spawnParticle(
  width: number,
  height: number,
  fromTop = true,
  rng: () => number = Math.random,
): Particle {
  const kind: ParticleKind = pick(['star', 'confetti', 'speck', 'speck'] as const, rng);
  const size =
    kind === 'star' ? rand(6, 13, rng) : kind === 'confetti' ? rand(5, 9, rng) : rand(1.5, 3, rng);
  const life = rand(5, 9, rng);
  return {
    x: rand(-30, width + 30, rng),
    y: fromTop ? rand(-height * 0.5, -10, rng) : rand(-height * 0.2, height + 10, rng),
    vx: rand(-12, 12, rng),
    vy: rand(18, 70, rng),
    life,
    maxLife: life,
    rot: rand(0, Math.PI * 2, rng),
    vRot: rand(-1.5, 1.5, rng),
    size,
    color: pick(PARTICLE_COLORS, rng),
    kind,
    drift: rand(6, 28, rng),
    driftSpeed: rand(0.6, 1.6, rng),
    phase: rand(0, Math.PI * 2, rng),
  };
}

/** Step a particle forward by dt seconds. Returns true if still alive. */
export function stepParticle(p: Particle, dt: number, width: number, height: number): boolean {
  p.life -= dt;
  if (p.life <= 0 || p.y > height + 40 || p.x < -60 || p.x > width + 60) {
    return false;
  }
  p.phase += dt * p.driftSpeed;
  const driftX = Math.sin(p.phase) * p.drift;
  p.x += (p.vx + driftX * 0.5) * dt;
  p.y += p.vy * dt;
  p.rot += p.vRot * dt;
  return true;
}

/**
 * Determine the per-viewport particle count. Exposed so tests verify the
 * mobile/desktop density split matches the spec.
 *
 * Density budget: each particle costs roughly one `.fillRect` or `.arc` +
 * transform per frame. Canvas fill is fast, but the SUM over N particles scales
 * linearly — at 90+ particles on a throttled mobile CPU, we're spending the
 * bulk of a frame just on particle draws, on top of the CSS animations layered
 * above/below the canvas. Keeping mobile tight lets the rest of the scene
 * breathe.
 *
 * Desktop cap 64: down from 92. The perceived difference on a 1440x900 canvas
 * is negligible — 64 particles is still visibly "snowing rainbow confetti" —
 * and the savings free the GPU to handle the 6 spotlights + note hue filters.
 * Mobile cap 20: down from 34. Combined with the dpr=1 backing store this keeps
 * per-frame sparkle cost bounded on low-end phones.
 */
export function particleCountForViewport(
  width: number,
  height: number,
  isMobile: boolean,
): number {
  return isMobile
    ? Math.min(20, Math.floor(width / 26))
    : Math.min(64, Math.floor((width * height) / 22000));
}
