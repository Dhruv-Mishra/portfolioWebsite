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
 * The ONLY exit path is the in-overlay "WAKE UP" button — no ESC, no
 * click-outside, no keypress, no navigation dismissal. This is an
 * intentional "Morpheus trap" UX.
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
import { setMatrixActiveImperative, useSoundsMuted } from '@/hooks/useStickers';
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
 * Read the current visible viewport size in CSS pixels. `visualViewport`
 * (when available) gives us the true rendered area — on iOS Safari this
 * matches the region between the top notch/URL-bar and the bottom toolbar,
 * which is exactly what we want to cover. Falling back to
 * `window.innerWidth/innerHeight` is fine for browsers without the API
 * (desktop Chrome still hits this path when `visualViewport` returns null
 * due to no pinch-zoom, though the modern spec always exposes it).
 *
 * Returns CSS-pixel dimensions; callers apply dpr scaling for the
 * backing-store. The minimum of `visualViewport` and `innerHeight` is
 * returned because `visualViewport.height` shrinks when a software
 * keyboard is open, and we want the canvas to continue painting behind
 * the keyboard rather than abruptly clipping.
 */
function readViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  const vv = window.visualViewport;
  if (vv) {
    // Use Math.max with innerHeight so opening the soft keyboard doesn't
    // shrink the matrix canvas out from under the user. Width uses the
    // visualViewport value directly — it accounts for horizontal page zoom
    // (pinch-zoom) which we DO want to track.
    return {
      width: vv.width,
      height: Math.max(vv.height, window.innerHeight),
    };
  }
  return { width: window.innerWidth, height: window.innerHeight };
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
        // Dynamic viewport units — match the visible area on iOS Safari
        // including the bottom-toolbar zone. The JS resize handler above
        // also sets pixel-precise width/height inline on the canvas element,
        // which overrides these CSS values — but these keep the INITIAL
        // paint full-viewport while the first resize runs, and provide a
        // sensible fallback if JS ever fails to attach.
        width: '100dvw',
        height: '100dvh',
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
 * Top-level overlay. Mounts the canvas, the WAKE UP button, and the audio
 * loop lifecycle. Parent (`DiscoFlagController`) gates the mount on
 * `matrixActive === true`.
 */
function DiscoMatrixOverlayImpl(): React.ReactElement {
  const soundsMuted = useSoundsMuted();
  const [wakeButtonVisible, setWakeButtonVisible] = useState(false);

  // WAKE UP appears after a short delay so the user gets 4 seconds of
  // matrix rain before the escape hatch. Setting this via state ensures
  // the button is tab-focusable the moment it's visible.
  useEffect(() => {
    const id = window.setTimeout(() => setWakeButtonVisible(true), WAKE_BUTTON_DELAY_MS);
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

  // Memoize the aria-live message so it doesn't refire on every re-render
  // (the parent only re-renders on mute flip + wake button timer).
  const liveMessage = useMemo(
    () => 'Matrix overlay active. A WAKE UP button will appear shortly in the center of the screen.',
    [],
  );

  return (
    <>
      <MatrixCanvas />
      <WakeUpButton visible={wakeButtonVisible} onWakeUp={handleWakeUp} />
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
