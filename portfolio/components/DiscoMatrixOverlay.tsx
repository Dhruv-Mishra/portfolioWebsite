"use client";

/**
 * DiscoMatrixOverlay — the classic falling-characters "Matrix rain" overlay.
 *
 * Invoked by `sudo matrix yes` (which flips the persisted `matrixActive`
 * flag on the sticker store to true). The mount is owned by
 * `DiscoFlagController` so we don't static-import this heavy chunk in the
 * eager bundle; it's fetched via dynamic import() only when the matrix
 * actually activates.
 *
 * PERSISTENCE: UNLIKE disco mode, matrix state survives navigation AND
 * reloads. The store key is `matrixActive: boolean` (persisted in v6+).
 * Exit paths:
 *   1. WAKE UP button (centered, appears at ~4s) — returns the user to the
 *      normal site by clearing the `matrixActive` flag.
 *   2. ESCAPE THE MATRIX button (bottom-right, appears at ~20s) — sets the
 *      `matrixEscaped` flag and plays a cinematic dissolve transition, then
 *      navigates to `/matrix-notes?from=escape`. First-time only achievement.
 * No ESC, click-outside, keypress or navigation dismissal paths beyond
 * those two buttons — this is an intentional "Morpheus trap" UX.
 *
 * RENDERING:
 *   - Canvas is sized to the viewport (capped at dpr 1.5 on mobile to keep
 *     per-frame fill cost reasonable on 3x retina phones).
 *   - Fall animation at ~30 fps (saves ~50% battery vs 60 fps with no
 *     perceptual loss for glyph rain).
 *   - Each column is a stream of glyphs falling top-to-bottom with a
 *     trailing fade (a dim semi-transparent fill layered every frame).
 *   - Column density scales with viewport: on mobile we use a slightly
 *     smaller `fontSize` so we get enough columns even on a 390px-wide
 *     iPhone; we cap the column count via a MIN_COLUMNS floor.
 *   - Resize + orientation-change resets the column array.
 *   - Pauses when the tab is hidden (`document.visibilityState === 'hidden`).
 *
 * ACCESSIBILITY:
 *   - The canvas itself is aria-hidden (pure decoration). An
 *     `aria-live="polite"` region announces the overlay once on mount so
 *     screen readers get context.
 *   - The WAKE UP button is keyboard-focusable and ships with a visible
 *     focus ring. Tab reaches it even though every other key is ignored.
 *
 * ACCESSIBILITY — REDUCE-MOTION NOTE:
 *   - The overlay INTENTIONALLY animates even when
 *     `prefers-reduced-motion: reduce` is set. Rationale: the user opted
 *     into a persistent trap; dropping to a static snapshot would defeat
 *     the premise. The user can always click WAKE UP to exit.
 *
 * AUDIO:
 *   - `/sounds/matrix.mp3` loops via `soundManager.startLoop('matrix')`
 *     from the moment the overlay mounts. Respects the sitewide
 *     `soundsMuted` preference. Stops on WAKE UP.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  setMatrixActiveImperative,
  setMatrixEscapedImperative,
  useSoundsMuted,
} from '@/hooks/useStickers';
import { soundManager } from '@/lib/soundManager';

const GLYPHS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロ01Dhruv';

/** Desktop font size in CSS px. */
const FONT_SIZE_DESKTOP = 18;
/** Mobile font size in CSS px — a bit smaller so we fit more columns. */
const FONT_SIZE_MOBILE = 15;
/** Minimum column count — guards against 4-giant-columns on a narrow phone. */
const MIN_COLUMNS = 18;
/** DPR cap on mobile — 1.5 is the sweet spot between crisp and cheap. */
const DPR_CAP_MOBILE = 1.5;
/** DPR cap on desktop. */
const DPR_CAP_DESKTOP = 2;
/** Target FPS — 30 is plenty for glyph rain and saves battery. */
const FRAME_INTERVAL_MS = 1000 / 30;
/** Delay before the WAKE UP button fades in. */
const WAKE_BUTTON_DELAY_MS = 4000;
/** Delay before the ESCAPE THE MATRIX button fades in. 20s per brief — long
 *  enough that WAKE UP is the obvious first exit and ESCAPE feels like a
 *  second, earned option for users who stick around. */
const ESCAPE_BUTTON_DELAY_MS = 20_000;
/** Duration of the cinematic "crystallize + flash" transition fired on
 *  ESCAPE click. Kept short enough that iOS low-power-mode won't strangle
 *  it into a slideshow, long enough to feel like an event. */
const ESCAPE_TRANSITION_MS = 1400;
/** Color for every glyph — classic matrix emerald. */
const GLYPH_COLOR = '#10b981';
/** Leading-edge glow — the character at the bottom of each stream is brighter. */
const LEAD_COLOR = '#6ee7b7';
/** Per-frame fade — lower = longer trails. */
const TRAIL_FADE_ALPHA = 0.08;

/** Narrow mobile check — a media query is enough (we don't need full device detect). */
function isNarrowViewport(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(max-width: 767px)').matches;
}

/** Effective DPR for the current viewport, capped to keep per-frame fill tight. */
function effectiveDpr(mobile: boolean): number {
  if (typeof window === 'undefined') return 1;
  const raw = window.devicePixelRatio || 1;
  return Math.min(raw, mobile ? DPR_CAP_MOBILE : DPR_CAP_DESKTOP);
}

/**
 * Read the current LAYOUT viewport size in CSS pixels.
 *
 * Why not `visualViewport`? On iOS Safari, the visual viewport SHRINKS when
 * the software keyboard is open — covering only the slice above the
 * keyboard. If the matrix canvas sizes itself off that slice, activating
 * matrix while the terminal input is focused (the common path:
 * `sudo matrix yes` + Go) leaves the bottom half of the screen uncovered
 * until the user dismisses the keyboard. The matrix overlay already blurs
 * the active element on mount, but between the state flip and the blur
 * taking effect there's a frame or two where the keyboard is still up.
 *
 * The LAYOUT viewport (a.k.a. Initial Containing Block height) never
 * shrinks for the keyboard — it's the full page-sized rect. We read it
 * via:
 *
 *   1. `document.documentElement.clientHeight` — the spec-compliant way
 *      to get the layout viewport height. Stable across every modern
 *      iOS/Android Safari/Chrome/Firefox.
 *   2. `window.innerHeight` — usually equals ICB height on desktop and on
 *      iOS/Android when no keyboard is open. DOES shrink on some Android
 *      Chrome builds with `interactive-widget=resizes-content` (we don't
 *      use that), so keep it as a sanity floor only.
 *   3. `window.visualViewport.height` — last-resort minimum floor if both
 *      above are zero (very defensive; shouldn't hit in practice).
 *
 * We pick the MAXIMUM of the three so: (a) keyboard-open doesn't shrink
 * the canvas; (b) a rotated device that was briefly reporting a stale
 * height still paints edge-to-edge; (c) pinch-zoom (visualViewport LARGER
 * than layout viewport on zoom-out with negative scale) also grows us.
 *
 * Width follows the same rule — layout viewport width is authoritative,
 * pinch-zoom tracks via visualViewport.
 */
function readViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  const docEl = typeof document !== 'undefined' ? document.documentElement : null;
  const vv = window.visualViewport;

  const layoutW = docEl?.clientWidth ?? 0;
  const layoutH = docEl?.clientHeight ?? 0;
  const innerW = window.innerWidth || 0;
  const innerH = window.innerHeight || 0;
  const vvW = vv?.width ?? 0;
  const vvH = vv?.height ?? 0;

  // Pick the largest non-zero reading for each axis. Layout viewport is
  // authoritative; innerWidth/Height acts as a fallback on very old
  // environments that don't expose clientWidth reliably.
  const width = Math.max(layoutW, innerW, vvW) || innerW || vvW;
  const height = Math.max(layoutH, innerH, vvH) || innerH || vvH;

  return { width, height };
}

/**
 * Compute font size and column count for the current viewport. Uses the CSS
 * pixel width (NOT the backing-store width) so columns stay visually
 * consistent across dpr values.
 */
function computeLayout(mobile: boolean, widthPx: number): { fontSize: number; columns: number } {
  if (typeof window === 'undefined') return { fontSize: FONT_SIZE_DESKTOP, columns: MIN_COLUMNS };
  const fontSize = mobile ? FONT_SIZE_MOBILE : FONT_SIZE_DESKTOP;
  const raw = Math.floor(widthPx / fontSize);
  const columns = Math.max(MIN_COLUMNS, raw);
  return { fontSize, columns };
}

/**
 * The canvas + animation loop. Broken out so the parent can own the
 * aria-live region + WAKE UP button without tangling with rAF bookkeeping.
 */
const MatrixCanvas = memo(function MatrixCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const ctx2d = canvasEl.getContext('2d', { alpha: true });
    if (!ctx2d) return;
    // Non-null bound references for the closures below — TypeScript can't
    // follow the ref's optionality across the nested function scopes, so we
    // shadow into plain consts once we've proven the ref is live.
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = ctx2d;

    let mobile = isNarrowViewport();
    let dpr = effectiveDpr(mobile);
    // Current CSS-pixel viewport size — read from visualViewport when
    // available (mobile Safari / Chrome) so we match the actual rendered
    // area, not the layout viewport. Updated on every resize + on the
    // visualViewport.resize event fired when the iOS URL-bar collapses.
    let viewport = readViewportSize();
    let layout = computeLayout(mobile, viewport.width);
    let drops: number[] = [];

    /** Seed drop positions — slight jitter so columns don't hit the bottom at once. */
    function seedDrops(): void {
      drops = new Array(layout.columns).fill(0).map(() => Math.floor(Math.random() * 20));
    }

    /** Size the canvas backing store + seed drops. Call on mount + resize. */
    function resize(): void {
      if (typeof window === 'undefined') return;
      mobile = isNarrowViewport();
      dpr = effectiveDpr(mobile);
      viewport = readViewportSize();
      layout = computeLayout(mobile, viewport.width);
      const { width, height } = viewport;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      // Reset transform + apply dpr scale so drawing math stays in CSS px.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedDrops();
      // Paint a solid black background once so the first frame isn't empty.
      ctx.fillStyle = 'rgba(0, 0, 0, 1)';
      ctx.fillRect(0, 0, width, height);
    }
    resize();

    // Use rAF with a frame-interval budget for ~30 fps pacing.
    let rafId = 0;
    let lastFrameTime = 0;
    let running = true;

    function step(now: number): void {
      if (!running) return;
      // Pause when tab is hidden — no reason to burn cycles off-screen.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        lastFrameTime = now;
        rafId = requestAnimationFrame(step);
        return;
      }
      if (now - lastFrameTime < FRAME_INTERVAL_MS) {
        rafId = requestAnimationFrame(step);
        return;
      }
      lastFrameTime = now;
      if (typeof window === 'undefined') return;
      // Use the same visible-viewport measurement as resize() so every frame
      // fades exactly the area we're actually drawing into. Using
      // `window.innerWidth/innerHeight` here would leave a strip un-faded
      // on iOS Safari when the URL bar is collapsed (visualViewport is
      // TALLER than the layout viewport in that state on the most recent
      // Safari builds, though historically it was the opposite — either
      // way, keeping resize + step aligned prevents mismatch).
      const w = viewport.width;
      const h = viewport.height;

      // Trailing fade — a semi-transparent black rect layered every frame
      // produces the tapering tail effect.
      ctx.fillStyle = `rgba(0, 0, 0, ${TRAIL_FADE_ALPHA})`;
      ctx.fillRect(0, 0, w, h);

      ctx.font = `${layout.fontSize}px "Fira Code", "Menlo", monospace`;
      ctx.textBaseline = 'top';

      for (let i = 0; i < drops.length; i++) {
        const text = GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
        const x = i * layout.fontSize;
        const y = drops[i] * layout.fontSize;
        // Leading glyph — brighter. Body glyphs — standard emerald.
        ctx.fillStyle = LEAD_COLOR;
        ctx.fillText(text, x, y);
        // Secondary tail fade behind the head so the trail has visible variation.
        if (drops[i] > 1) {
          ctx.fillStyle = GLYPH_COLOR;
          const secondaryText = GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
          ctx.fillText(secondaryText, x, y - layout.fontSize);
        }
        // Reset when the tail reaches the bottom (random chance for staggered reset).
        if (y > h && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i] += 1;
      }
      rafId = requestAnimationFrame(step);
    }
    rafId = requestAnimationFrame(step);

    // Resize + orientation listeners.
    const onResize = (): void => {
      resize();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    // iOS Safari: `window.resize` fires only when the layout viewport changes,
    // not when the URL bar / bottom toolbar collapses. `visualViewport.resize`
    // fires for those toolbar-driven visible-viewport changes — without this
    // listener the matrix canvas leaves a black gap where the toolbar used
    // to be until the user scrolls. Capture + cleanup below.
    const vv = window.visualViewport;
    const onVisualViewportResize = (): void => {
      resize();
    };
    if (vv) {
      vv.addEventListener('resize', onVisualViewportResize);
      // Some Safari builds fire scroll instead of resize when the toolbar
      // collapses during inertial scroll. Both handlers just call resize();
      // the work there is idempotent and cheap.
      vv.addEventListener('scroll', onVisualViewportResize);
    }
    // Visibility changes: rAF loop handles pause/resume via the hidden check;
    // we also seed drops when the tab comes back so the loop doesn't resume
    // with the same frozen glyph at the bottom of each column.
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        // Don't reseed drops — just reset lastFrameTime so the first frame
        // back is immediate (not waiting out a full interval).
        lastFrameTime = 0;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      if (vv) {
        vv.removeEventListener('resize', onVisualViewportResize);
        vv.removeEventListener('scroll', onVisualViewportResize);
      }
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        // Largest-viewport units — `100lvh`/`100lvw` return the FULL layout
        // viewport size on iOS Safari, ignoring the software keyboard and
        // the URL bar. This matches the JS resize handler (which reads
        // `documentElement.clientHeight`), so the initial paint and the
        // first programmatic resize agree.
        //
        // Note: we previously used `100dvh`/`100dvw` (dynamic) — those
        // units SHRINK when the iOS keyboard is open, which left the
        // bottom half of the canvas uncovered for users who activated
        // matrix via `sudo matrix yes` with the terminal input focused.
        // The JS handler overrode this to the full layout height within
        // a frame, but the initial paint showed a visible gap. `100lvh`
        // removes that race entirely — the initial paint is already
        // full-viewport.
        width: '100lvw',
        height: '100lvh',
        zIndex: 9998,
        background: '#000000',
        pointerEvents: 'none',
        // Promote to its own compositing layer for GPU-backed compositing.
        transform: 'translate3d(0,0,0)',
        willChange: 'transform',
      }}
    />
  );
});

/**
 * The in-overlay WAKE UP button. Styled as a dim cyan pill with a pulsing
 * glow — Morpheus's offer of the red pill. Clicking clears the persisted
 * matrix flag; the parent unmounts this whole tree in response.
 */
interface WakeUpButtonProps {
  visible: boolean;
  onWakeUp: () => void;
}

const WakeUpButton = memo(function WakeUpButton({ visible, onWakeUp }: WakeUpButtonProps) {
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '10vh',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        pointerEvents: visible ? 'auto' : 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 600ms ease-in',
      }}
    >
      <button
        type="button"
        onClick={onWakeUp}
        aria-label="Wake up — exit matrix overlay"
        tabIndex={visible ? 0 : -1}
        style={{
          fontFamily: '"Fira Code", "Menlo", monospace',
          fontSize: '1rem',
          letterSpacing: '0.3em',
          color: '#67e8f9',
          background: 'rgba(6, 182, 212, 0.08)',
          border: '1.5px solid rgba(103, 232, 249, 0.6)',
          borderRadius: '9999px',
          padding: '0.75rem 2rem',
          cursor: 'pointer',
          boxShadow: '0 0 24px rgba(103, 232, 249, 0.35)',
          animation: visible ? 'matrix-wake-pulse 2.2s ease-in-out infinite' : 'none',
          outline: 'none',
          transform: 'translate3d(0,0,0)',
          willChange: 'box-shadow, opacity',
        }}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow =
            '0 0 32px rgba(103, 232, 249, 0.7), 0 0 0 3px rgba(103, 232, 249, 0.35)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = '0 0 24px rgba(103, 232, 249, 0.35)';
        }}
      >
        WAKE UP
      </button>
      {/* Pulse keyframes inlined via a style tag since we don't use a CSS module here. */}
      <style>{`
        @keyframes matrix-wake-pulse {
          0%, 100% { box-shadow: 0 0 18px rgba(103, 232, 249, 0.3); }
          50%      { box-shadow: 0 0 36px rgba(103, 232, 249, 0.7); }
        }
      `}</style>
    </div>
  );
});

/**
 * ESCAPE THE MATRIX button — the second escape hatch. Visually + positionally
 * distinct from WAKE UP so they don't compete:
 *   - WAKE UP is center-bottom, cyan, pulses gently — "return to normal".
 *   - ESCAPE is bottom-right, emerald, a sharper glitchy feel — "go deeper".
 *
 * First appears at 20s. Clicking triggers the `onEscape` callback which
 * owns the transition animation + navigation — this component is pure
 * presentation plus the click handler.
 */
interface EscapeButtonProps {
  visible: boolean;
  onEscape: () => void;
}

const EscapeButton = memo(function EscapeButton({ visible, onEscape }: EscapeButtonProps) {
  return (
    <div
      style={{
        position: 'fixed',
        right: 'max(1rem, env(safe-area-inset-right))',
        bottom: 'max(1rem, env(safe-area-inset-bottom))',
        zIndex: 9999,
        pointerEvents: visible ? 'auto' : 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 900ms ease-in',
      }}
    >
      <button
        type="button"
        onClick={onEscape}
        aria-label="Escape the Matrix — take a different way out"
        tabIndex={visible ? 0 : -1}
        style={{
          fontFamily: '"Fira Code", "Menlo", monospace',
          fontSize: '0.85rem',
          letterSpacing: '0.3em',
          color: '#a7f3d0',
          background: 'rgba(6, 78, 59, 0.4)',
          border: '1.5px solid rgba(110, 231, 183, 0.55)',
          borderRadius: '8px',
          padding: '0.7rem 1.25rem',
          minHeight: '44px',
          minWidth: '44px',
          cursor: 'pointer',
          boxShadow: '0 0 20px rgba(16, 185, 129, 0.35)',
          animation: visible ? 'matrix-escape-flicker 3.4s ease-in-out infinite' : 'none',
          outline: 'none',
          transform: 'translate3d(0,0,0)',
          willChange: 'box-shadow, opacity',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow =
            '0 0 30px rgba(16, 185, 129, 0.7), 0 0 0 3px rgba(110, 231, 183, 0.4)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.35)';
        }}
      >
        ESCAPE THE MATRIX →
      </button>
      {/* Flicker keyframes inlined — subtle glyph-glitch feel, not a strobe. */}
      <style>{`
        @keyframes matrix-escape-flicker {
          0%, 100% { box-shadow: 0 0 14px rgba(16, 185, 129, 0.3); filter: none; }
          48%      { box-shadow: 0 0 22px rgba(16, 185, 129, 0.65); filter: none; }
          49%      { filter: hue-rotate(-8deg) brightness(1.08); }
          51%      { filter: none; }
          52%      { box-shadow: 0 0 28px rgba(110, 231, 183, 0.55); }
        }
      `}</style>
    </div>
  );
});

/**
 * EscapeTransition — the cinematic "dissolve" overlay that plays on ESCAPE
 * click. Three visual beats:
 *   1. `shard`  (0 → ~45%): vertical emerald bars converge from the edges
 *      toward the horizontal center of the viewport — the rain
 *      "crystallizing".
 *   2. `flash`  (~45 → ~65%): a full-viewport white flash fades in and out.
 *   3. `fade`   (~65 → 100%): everything fades to black, handing off to
 *      the destination route load.
 *
 * All of this runs with CSS keyframes on compositor-only properties
 * (opacity / transform) so it stays smooth on iOS low-power mode.
 */
interface EscapeTransitionProps {
  active: boolean;
}

const EscapeTransition = memo(function EscapeTransition({ active }: EscapeTransitionProps) {
  if (!active) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        pointerEvents: 'none',
      }}
    >
      {/* Shard bars — six vertical bars that converge to the center. */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        // Bars distributed from the edges inward. The even-indexed bars
        // slide in from the left, odd from the right — they meet in the
        // middle for the "crystallize" beat.
        const fromLeft = i % 2 === 0;
        const startPct = fromLeft ? -10 - i * 4 : 110 + i * 4;
        const endPct = 50;
        const delayMs = 20 * i;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: '8vw',
              minWidth: 60,
              background:
                'linear-gradient(180deg, rgba(16,185,129,0.0) 0%, rgba(16,185,129,0.55) 30%, #34d399 50%, rgba(16,185,129,0.55) 70%, rgba(16,185,129,0.0) 100%)',
              boxShadow: '0 0 40px rgba(16,185,129,0.65)',
              transform: `translateX(${startPct}vw)`,
              animation: `matrix-shard-converge 700ms cubic-bezier(0.45, 0, 0.2, 1) ${delayMs}ms forwards`,
              ['--shard-start' as string]: `${startPct}vw`,
              ['--shard-end' as string]: `${endPct}vw`,
            } as React.CSSProperties}
          />
        );
      })}
      {/* White flash — sits on top of the shards. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#ffffff',
          opacity: 0,
          animation: 'matrix-escape-flash 520ms ease-out 620ms forwards',
        }}
      />
      {/* Final fade-to-black — ensures the handoff to the next route is
          clean even if the browser paints the destination a frame late. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#000000',
          opacity: 0,
          animation: 'matrix-escape-blackout 380ms ease-in 1000ms forwards',
        }}
      />
      <style>{`
        @keyframes matrix-shard-converge {
          0%   { transform: translateX(var(--shard-start, 0)); opacity: 0; }
          20%  { opacity: 1; }
          100% { transform: translateX(var(--shard-end, 0)); opacity: 1; }
        }
        @keyframes matrix-escape-flash {
          0%   { opacity: 0; }
          40%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes matrix-escape-blackout {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes matrix-shard-converge {
            0%, 100% { transform: none; opacity: 1; }
          }
          @keyframes matrix-escape-flash {
            0%, 100% { opacity: 0; }
          }
        }
      `}</style>
    </div>
  );
});

/**
 * Top-level overlay. Mounts the canvas, the WAKE UP / ESCAPE buttons,
 * the transition layer, and the audio loop lifecycle. Parent
 * (`DiscoFlagController`) gates the mount on `matrixActive === true`.
 */
function DiscoMatrixOverlayImpl(): React.ReactElement {
  const router = useRouter();
  const soundsMuted = useSoundsMuted();
  const [wakeButtonVisible, setWakeButtonVisible] = useState(false);
  const [escapeButtonVisible, setEscapeButtonVisible] = useState(false);
  const [escapeTransitionActive, setEscapeTransitionActive] = useState(false);
  // Guard against double-click firing two router pushes + two flag writes.
  const escapeFiredRef = useRef(false);

  // On mount, dismiss the iOS/Android software keyboard if any input is
  // focused. The common activation path is `sudo matrix yes` + Go — the
  // user's terminal input field is focused, the keyboard is up, and the
  // matrix canvas would otherwise paint into the shrunken visual viewport
  // (only the slice above the keyboard). Blurring the active element
  // tells iOS to dismiss the keyboard, after which visualViewport.resize
  // fires and our canvas re-measures to the full layout size. We also
  // immediately read the LAYOUT viewport height (not the visual viewport),
  // so even during the few frames before the keyboard dismisses the canvas
  // is already sized to the full page.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const active = document.activeElement as HTMLElement | null;
    // Only blur inputs/textareas/contenteditables — blurring arbitrary
    // focused elements (like buttons) would steal focus from the user's
    // ongoing keyboard navigation. The matrix overlay's own tabindex
    // management takes over from here.
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
      try {
        active.blur();
      } catch {
        /* best-effort */
      }
    }
  }, []);

  // WAKE UP appears after a short delay so the user gets 4 seconds of
  // matrix rain before the escape hatch. Setting this via state ensures
  // the button is tab-focusable the moment it's visible.
  useEffect(() => {
    const id = window.setTimeout(() => setWakeButtonVisible(true), WAKE_BUTTON_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  // ESCAPE THE MATRIX appears AFTER WAKE UP — at 20s — so that WAKE UP is
  // clearly the obvious first option and ESCAPE is a second, earned choice
  // for users who stick around. If the user clicks WAKE UP before 20s the
  // overlay unmounts and this timer is cleared (timer-leak guard below).
  useEffect(() => {
    const id = window.setTimeout(() => setEscapeButtonVisible(true), ESCAPE_BUTTON_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  // Audio lifecycle: start the matrix loop on mount, stop on unmount. The
  // manager respects sitewide mute; we also mirror the preference into
  // the loop's per-handle mute to silence a freshly-started loop if the
  // user was already muted before matrix engaged.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const started = soundManager.startLoop('matrix');
    if (started) {
      soundManager.setLoopMuted('matrix', soundsMuted);
    }
    return () => {
      try {
        soundManager.stopLoop('matrix');
      } catch {
        /* best-effort */
      }
    };
    // Intentionally run once per mount — soundsMuted flips are piped via
    // the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pipe sitewide mute flips into the matrix loop. Buffer-backed loops
  // already ride the master gain that setMuted ramps, but a per-loop mute
  // ramp keeps the UX consistent with the disco loop.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    soundManager.setLoopMuted('matrix', soundsMuted);
  }, [soundsMuted]);

  const handleWakeUp = useCallback(() => {
    setMatrixActiveImperative(false);
    // Audio stops in the unmount cleanup above.
  }, []);

  /**
   * Fire the ESCAPE transition. Sequence:
   *   1. Set the `matrixEscaped` flag immediately so subsequent
   *      `/matrix-notes` renders will show the wall even if navigation
   *      races the localStorage flush.
   *   2. Start the CSS transition overlay. Disable pointer events so a
   *      double-tap can't re-fire.
   *   3. After `ESCAPE_TRANSITION_MS`, navigate to
   *      `/matrix-notes?from=escape` AND clear `matrixActive`. The gate
   *      on the destination route reads the flag and reveals the wall.
   *
   * iOS note: we use `router.push` rather than `window.location.href`
   * because iOS Safari sometimes blocks programmatic `window.location`
   * writes inside async handlers (ours is effectively async — the timeout
   * fires after a user click but the nav is detached from the gesture).
   * `router.push` is client navigation and isn't subject to that heuristic.
   */
  const handleEscape = useCallback(() => {
    if (escapeFiredRef.current) return;
    escapeFiredRef.current = true;

    // Flip the flag first so any racing render already sees it.
    setMatrixEscapedImperative(true);

    // Trigger transition.
    setEscapeTransitionActive(true);

    // After the visual beat, navigate. Clear matrixActive AFTER the push
    // so the overlay remains painted for the full transition — otherwise
    // `DiscoFlagController` would unmount us mid-dissolve.
    window.setTimeout(() => {
      router.push('/matrix-notes?from=escape');
      // Small additional buffer before clearing matrixActive so the
      // destination page has a frame to paint under the black fade.
      window.setTimeout(() => {
        setMatrixActiveImperative(false);
      }, 120);
    }, ESCAPE_TRANSITION_MS);
  }, [router]);

  // Memoize the aria-live message so it doesn't refire on every re-render
  // (the parent only re-renders on mute flip + wake button timer).
  const liveMessage = useMemo(
    () =>
      'Matrix overlay active. A WAKE UP button will appear shortly in the center of the screen. ' +
      'An ESCAPE button will appear later for a second, different way out.',
    [],
  );

  return (
    <>
      <MatrixCanvas />
      <WakeUpButton visible={wakeButtonVisible && !escapeTransitionActive} onWakeUp={handleWakeUp} />
      <EscapeButton
        visible={escapeButtonVisible && !escapeTransitionActive}
        onEscape={handleEscape}
      />
      <EscapeTransition active={escapeTransitionActive} />
      {/* Screen-reader announcement only — visually hidden. */}
      <span
        aria-live="polite"
        style={{
          position: 'fixed',
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {liveMessage}
      </span>
    </>
  );
}

const DiscoMatrixOverlay = memo(DiscoMatrixOverlayImpl);

export default DiscoMatrixOverlay;
