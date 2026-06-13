"use client";

import { useEffect, useRef, useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface ListeningOverlayProps {
  isListening: boolean;
  isTranscribing?: boolean;
  backend: 'native' | 'whisper' | null;
  /** Native-only live partial transcript. Ignored for whisper backend. */
  interim?: string;
  /** Live AnalyserNode (both backends). CSS bars are used when null. */
  analyser?: AnalyserNode | null;
  /** Optional className for outer wrapper. */
  className?: string;
}

const NUM_BARS = 14;
const SURFACE_INITIAL = { opacity: 0, y: 4 } as const;
const SURFACE_ANIMATE = { opacity: 1, y: 0 } as const;
const SURFACE_EXIT = { opacity: 0, y: 2 } as const;
const SURFACE_TRANSITION = { duration: 0.18, ease: 'easeOut' } as const;

function formatTimer(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!active) {
      startRef.current = null;
      setSeconds(0);
      return;
    }
    startRef.current = Date.now();
    setSeconds(0);
    const id = window.setInterval(() => {
      const start = startRef.current;
      if (start == null) return;
      setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [active]);
  return seconds;
}

interface WaveformProps {
  analyser: AnalyserNode | null;
  active: boolean;
}

function Waveform({ analyser, active }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || !analyser) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      const w = Math.max(1, Math.floor(clientWidth * dpr));
      const h = Math.max(1, Math.floor(clientHeight * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);

    const buf = new Uint8Array(analyser.frequencyBinCount);

    const computeColor = () => {
      try {
        const v = getComputedStyle(canvas).getPropertyValue('color').trim();
        return v || '#222';
      } catch {
        return '#222';
      }
    };

    const draw = () => {
      analyser.getByteFrequencyData(buf);
      const W = canvas.width;
      const H = canvas.height;
      ctx2d.clearRect(0, 0, W, H);
      ctx2d.fillStyle = computeColor();
      const bars = NUM_BARS;
      const gap = Math.max(2, Math.floor(W / (bars * 5)));
      const barW = Math.max(2, Math.floor((W - gap * (bars + 1)) / bars));
      // Skip lowest bins (DC + sub-bass noise) and cap at upper voice band.
      const startBin = Math.max(1, Math.floor(buf.length * 0.04));
      const endBin = Math.min(buf.length, Math.floor(buf.length * 0.55));
      const usable = Math.max(bars, endBin - startBin);
      const step = Math.floor(usable / bars);
      const minH = Math.max(2 * dpr, Math.floor(H * 0.12));
      for (let i = 0; i < bars; i++) {
        let sum = 0;
        let count = 0;
        for (let j = 0; j < step; j++) {
          sum += buf[startBin + i * step + j] ?? 0;
          count++;
        }
        const v = count ? sum / count / 255 : 0;
        // Slight curve so quiet voice still registers.
        const eased = Math.pow(v, 0.7);
        const h = Math.max(minH, Math.floor(eased * H * 0.95));
        const x = gap + i * (barW + gap);
        const y = Math.floor((H - h) / 2);
        const radius = Math.min(barW / 2, h / 2, 4 * dpr);
        ctx2d.beginPath();
        ctx2d.moveTo(x + radius, y);
        ctx2d.lineTo(x + barW - radius, y);
        ctx2d.quadraticCurveTo(x + barW, y, x + barW, y + radius);
        ctx2d.lineTo(x + barW, y + h - radius);
        ctx2d.quadraticCurveTo(x + barW, y + h, x + barW - radius, y + h);
        ctx2d.lineTo(x + radius, y + h);
        ctx2d.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx2d.lineTo(x, y + radius);
        ctx2d.quadraticCurveTo(x, y, x + radius, y);
        ctx2d.closePath();
        ctx2d.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      ro?.disconnect();
    };
  }, [active, analyser]);

  if (!analyser) {
    // CSS-only fallback bars (no analyser available — e.g. permissions edge).
    return (
      <div className="flex items-center justify-center gap-[3px] h-full w-full">
        {Array.from({ length: NUM_BARS }).map((_, i) => (
          <span
            key={i}
            className="block w-[3px] rounded-full bg-current animate-listening-bar"
            style={{
              animationDelay: `${(i % 7) * 0.08}s`,
              height: '50%',
            }}
          />
        ))}
      </div>
    );
  }
  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full text-[var(--c-ink)]"
      aria-hidden
    />
  );
}

/**
 * Sketchbook-styled "recording surface" rendered on top of a textarea
 * while voice capture is active. Designed to be dropped into a `relative`
 * wrapper around the textarea and paired with an `invisible` class on
 * the textarea itself so the surface appears to *replace* the input
 * in-place (bar-morph pattern).
 *
 * Background is intentionally transparent — the host sticky-note paper
 * shows through, keeping the sketchbook aesthetic intact.
 */
export function ListeningOverlay({
  isListening,
  isTranscribing = false,
  backend,
  interim,
  analyser,
  className,
}: ListeningOverlayProps) {
  const elapsed = useElapsedSeconds(isListening);

  return (
    <AnimatePresence>
      {isListening && (
        <m.div
          key="listening-surface"
          initial={SURFACE_INITIAL}
          animate={SURFACE_ANIMATE}
          exit={SURFACE_EXIT}
          transition={SURFACE_TRANSITION}
          aria-live="polite"
          aria-label="Recording voice note"
          className={cn(
            'absolute inset-0 z-10 pointer-events-none',
            'flex flex-col justify-center gap-1',
            'text-[var(--c-ink)]',
            className,
          )}
        >
          <div className="flex items-center gap-2 md:gap-3 w-full px-1">
            {/* Pulsing red dot + REC label */}
            <span className="inline-flex items-center gap-1.5 shrink-0 font-hand text-[11px] md:text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
              <span aria-hidden className="relative inline-flex w-2.5 h-2.5">
                <span className="absolute inset-0 rounded-full bg-red-500/40 animate-ping" />
                <span className="relative inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
              </span>
              REC
            </span>

            {/* Waveform — flexes to fill */}
            <div className="flex-1 min-w-0 h-7 md:h-8 text-[var(--c-ink)]/80">
              <Waveform analyser={analyser ?? null} active={isListening} />
            </div>

            {/* Monospace timer */}
            <span
              className="shrink-0 font-code text-xs md:text-sm tabular-nums text-[var(--c-ink)]/70"
              aria-hidden
            >
              {formatTimer(elapsed)}
            </span>
          </div>

          {/* Hint / interim transcript line */}
          <div className="flex items-center justify-center px-1 min-h-[1em]">
            {backend === 'native' && interim ? (
              <span className="font-hand text-xs md:text-sm italic opacity-80 line-clamp-1 text-center max-w-full">
                {interim}
              </span>
            ) : (
              <span className="font-hand text-[10px] md:text-[11px] italic opacity-50 text-center">
                {backend === 'whisper'
                  ? 'tap mic to stop · transcribes when you stop'
                  : 'tap mic to stop'}
              </span>
            )}
          </div>
        </m.div>
      )}
      {!isListening && isTranscribing && (
        <m.div
          key="transcribing-surface"
          initial={SURFACE_INITIAL}
          animate={SURFACE_ANIMATE}
          exit={SURFACE_EXIT}
          transition={SURFACE_TRANSITION}
          aria-live="polite"
          className={cn(
            'absolute inset-0 z-10 pointer-events-none',
            'flex items-center justify-center gap-2',
            'text-[var(--c-ink)]',
            className,
          )}
        >
          <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />
          <span className="font-hand text-xs md:text-sm italic opacity-80">
            transcribing…
          </span>
        </m.div>
      )}
    </AnimatePresence>
  );
}

export default ListeningOverlay;
