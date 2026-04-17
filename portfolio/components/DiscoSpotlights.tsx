"use client";

/**
 * DiscoSpotlights — six drifting radial-gradient beams rendered as fixed
 * DOM elements. Pure CSS animation on transform + opacity, so the whole thing
 * runs on the compositor thread.
 *
 * Why DOM not canvas: six large radial gradients are cheap as a background
 * and the browser can composite them without burning the CPU every frame. A
 * canvas rendering of soft falloff circles at viewport size would be slower.
 *
 * Blend mode is `screen` so the beams LIGHTEN the content below instead of
 * darkening it. On dark backgrounds they become glow spots; on light
 * backgrounds they tint toward their hue without crushing text contrast.
 *
 * Opacity budget: the three original beams peak at ~0.55 opacity each, the
 * three extras peak at ~0.35 — combined (screen blend) the stage stays
 * readable. Peak opacity is set in the radial-gradient stops; the keyframe
 * `opacity` modulates between 0.22 and 0.35 for the extras to keep the
 * background from going milky under text.
 *
 * Paths are genuinely different shapes — not speed variations of one curve:
 *   - magenta: asymmetric ellipse (left-top focus)
 *   - cyan: right-sided drift
 *   - gold: diagonal figure
 *   - violet: figure-8 with mid-crossover
 *   - lime: inward spiral (linear timing — feels mechanical / precise)
 *   - coral: horizontal zigzag hugging left + right edges, verifying the
 *     now-disco-fied binding spine gets light too.
 */

import { memo } from 'react';

interface SpotProps {
  /** Unique token used to tune the per-spot keyframe. */
  variant: 'magenta' | 'cyan' | 'gold' | 'violet' | 'lime' | 'coral';
}

const SPOT_STYLES: Record<SpotProps['variant'], React.CSSProperties> = {
  magenta: {
    background:
      'radial-gradient(closest-side, rgba(236, 72, 153, 0.55), rgba(236, 72, 153, 0) 70%)',
  },
  cyan: {
    background:
      'radial-gradient(closest-side, rgba(6, 182, 212, 0.5), rgba(6, 182, 212, 0) 70%)',
  },
  gold: {
    background:
      'radial-gradient(closest-side, rgba(250, 204, 21, 0.55), rgba(250, 204, 21, 0) 70%)',
  },
  // ── Extras — clamped lower so the combined opacity ceiling stays under ~0.6. ──
  violet: {
    background:
      'radial-gradient(closest-side, rgba(167, 139, 250, 0.40), rgba(167, 139, 250, 0) 70%)',
  },
  lime: {
    background:
      'radial-gradient(closest-side, rgba(163, 230, 53, 0.38), rgba(163, 230, 53, 0) 70%)',
  },
  coral: {
    background:
      'radial-gradient(closest-side, rgba(251, 146, 120, 0.42), rgba(251, 146, 120, 0) 70%)',
  },
};

const Spot = memo(function Spot({ variant }: SpotProps) {
  return (
    <div
      aria-hidden="true"
      className={`disco-spot disco-spot--${variant}`}
      style={SPOT_STYLES[variant]}
    />
  );
});

function DiscoSpotlights(): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      className="disco-spotlights"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2, mixBlendMode: 'screen' }}
    >
      <Spot variant="magenta" />
      <Spot variant="cyan" />
      <Spot variant="gold" />
      <Spot variant="violet" />
      <Spot variant="lime" />
      <Spot variant="coral" />
    </div>
  );
}

export default memo(DiscoSpotlights);
