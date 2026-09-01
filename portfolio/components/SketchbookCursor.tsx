"use client";
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { LAYOUT_TOKENS, CURSOR_TRAIL, TIMING_TOKENS, Z_INDEX } from '@/lib/designTokens';
import { useTheme } from 'next-themes';
import { useEffectiveReducedMotion } from '@/hooks/useEffectiveReducedMotion';

interface TrailPoint { x: number; y: number; t: number }

const MAX_POINTS = LAYOUT_TOKENS.cursorMaxPoints;
const MAX_TRAIL_DPR = 1.5;
const HOVER_SCALE = 1.3;
const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function getTrailDpr(): number {
    return Math.min(window.devicePixelRatio || 1, MAX_TRAIL_DPR);
}

export default function SketchbookCursor() {
    const cursorRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { resolvedTheme } = useTheme();
    const reducedMotion = useEffectiveReducedMotion();
    const mounted = useSyncExternalStore(
        subscribeToHydration,
        getClientHydrationSnapshot,
        getServerHydrationSnapshot,
    );
    const themeRef = useRef(resolvedTheme);

    useEffect(() => {
        themeRef.current = resolvedTheme;
    }, [resolvedTheme]);

    useEffect(() => {
        let lastMoveTime = performance.now();
        if (!mounted) return;

        const canUseCustomCursor = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        if (!canUseCustomCursor || reducedMotion) return;

        document.documentElement.dataset.customCursor = 'ready';

        const points: TrailPoint[] = [];
        const cursorEl = cursorRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { alpha: true });
        let dpr = getTrailDpr();
        let rafId = 0;
        let isHoveringLink = false;
        let isVisible = true;
        let lastHoverTarget: EventTarget | null = null;
        let pointerX = -100;
        let pointerY = -100;
        let pointerTarget: EventTarget | null = null;
        let pointerPending = false;

        const applyCursorStyle = () => {
            if (!cursorEl) return;
            const scale = isHoveringLink ? HOVER_SCALE : 1;
            cursorEl.style.transform = `translate3d(${pointerX}px, ${pointerY}px, 0) scale(${scale})`;
            cursorEl.style.opacity = isVisible ? '1' : '0';
        };

        const checkHover = (target: EventTarget | null) => {
            if (target === lastHoverTarget || !(target instanceof HTMLElement)) return;
            lastHoverTarget = target;
            isHoveringLink = !!(target.tagName === 'A' || target.tagName === 'BUTTON' || target.tagName === 'INPUT' ||
                target.closest('a') || target.closest('button') || target.closest('[data-clickable]'));
        };

        const applyPointerMove = (now: number) => {
            if (!pointerPending) return;
            pointerPending = false;
            checkHover(pointerTarget);
            lastMoveTime = now;

            const prev = points.length > 0 ? points[points.length - 1] : null;
            const dx = prev ? pointerX - prev.x : Infinity;
            const dy = prev ? pointerY - prev.y : Infinity;
            const dist2 = dx * dx + dy * dy;

            if (dist2 >= LAYOUT_TOKENS.cursorMaxDist2) {
                points.length = 0;
                points.push({ x: pointerX, y: pointerY, t: now });
            } else if (dist2 > LAYOUT_TOKENS.cursorMinDist2) {
                if (points.length >= MAX_POINTS) points.shift();
                points.push({ x: pointerX, y: pointerY, t: now });
            }
        };

        const renderTrail = () => {
            rafId = 0;
            if (!canvas || !ctx) return;

            const now = performance.now();
            applyPointerMove(now);
            applyCursorStyle();

            ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

            const isDark = themeRef.current === 'dark';
            const trailLife = isDark ? TIMING_TOKENS.trailLifeDark : TIMING_TOKENS.trailLifeLight;

            while (points.length > 0 && now - points[0].t > trailLife) {
                points.shift();
            }

            if (points.length > 1) {
                ctx.beginPath();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.strokeStyle = isDark ? CURSOR_TRAIL.dark.color : CURSOR_TRAIL.light.color;
                ctx.lineWidth = isDark ? CURSOR_TRAIL.dark.lineWidth : CURSOR_TRAIL.light.lineWidth;

                ctx.moveTo(points[0].x, points[0].y);
                let prev = points[0];
                for (let i = 1; i < points.length; i++) {
                    const pt = points[i];
                    ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + pt.x) * 0.5, (prev.y + pt.y) * 0.5);
                    prev = pt;
                }
                ctx.lineTo(prev.x, prev.y);
                ctx.stroke();
            }

            if (points.length === 0 && !pointerPending && now - lastMoveTime > TIMING_TOKENS.cursorIdleThreshold) {
                return;
            }

            rafId = requestAnimationFrame(renderTrail);
        };

        const wakeLoop = () => {
            if (rafId === 0) {
                rafId = requestAnimationFrame(renderTrail);
            }
        };

        const queueCursorMove = (event: MouseEvent) => {
            pointerX = event.clientX;
            pointerY = event.clientY;
            pointerTarget = event.target;
            pointerPending = true;
            wakeLoop();
        };

        const setCursorVisible = (visible: boolean) => {
            isVisible = visible;
            if (!visible) {
                isHoveringLink = false;
                lastHoverTarget = null;
            }
            applyCursorStyle();
        };
        const handleMouseLeave = () => setCursorVisible(false);
        const handleMouseEnter = () => setCursorVisible(true);
        const handleHideCursor = () => setCursorVisible(false);
        const handleShowCursor = () => setCursorVisible(true);

        const resizeCanvas = () => {
            if (!canvas) return;
            dpr = getTrailDpr();
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = window.innerWidth + 'px';
            canvas.style.height = window.innerHeight + 'px';
            ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        let resizeTimer: ReturnType<typeof setTimeout>;
        const handleResize = () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(resizeCanvas, TIMING_TOKENS.resizeDebounce);
        };

        window.addEventListener('mousemove', queueCursorMove, { passive: true });
        document.addEventListener('mouseleave', handleMouseLeave);
        document.addEventListener('mouseenter', handleMouseEnter);
        window.addEventListener('sketchbook:hideCursor', handleHideCursor);
        window.addEventListener('sketchbook:showCursor', handleShowCursor);
        window.addEventListener('resize', handleResize, { passive: true });

        resizeCanvas();
        applyCursorStyle();

        return () => {
            window.removeEventListener('mousemove', queueCursorMove);
            document.removeEventListener('mouseleave', handleMouseLeave);
            document.removeEventListener('mouseenter', handleMouseEnter);
            window.removeEventListener('sketchbook:hideCursor', handleHideCursor);
            window.removeEventListener('sketchbook:showCursor', handleShowCursor);
            window.removeEventListener('resize', handleResize);
            clearTimeout(resizeTimer);
            if (rafId) cancelAnimationFrame(rafId);
            if (document.documentElement.dataset.customCursor === 'ready') {
                delete document.documentElement.dataset.customCursor;
            }
        };
    }, [mounted, reducedMotion]);

    if (!mounted || reducedMotion) return null;

    return (
        <div className="pointer-events-none fixed inset-0 overflow-hidden hidden md:block" style={{ zIndex: Z_INDEX.cursor }}>
            {/* Trail Canvas */}
            <canvas
                ref={canvasRef}
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none"
            />

            {/* Cursor Item (Pencil or Chalk) */}
            <div
                ref={cursorRef}
                className="absolute top-0 left-0"
                style={{ transform: 'translate3d(-100px, -100px, 0)', opacity: 1 }}
            >
                <div className="w-[var(--c-cursor-size)] md:w-[var(--c-cursor-size-md)] h-[var(--c-cursor-size)] md:h-[var(--c-cursor-size-md)]">
                    {resolvedTheme === 'dark' ? (
                        /* Chalk Stick SVG */
                        <svg className="absolute top-0 left-0" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            {/* Chalk Tip (Worn/Jagged) */}
                            <path d="M0 0 L2.5 7.5 L7.5 2.5 Z" fill="#d1d5db" />
                            {/* Main Chalk Body */}
                            <path d="M2.5 7.5 L7.5 2.5 L28.5 23.5 L23.5 28.5 Z" fill="#e5e7eb" />
                            {/* Chalk Dust Texture */}
                            <path d="M5 7 L7 5 L9 7 L7 9 Z" fill="#d1d5db" />
                            <path d="M10 10 L11 9 L25 23 L24 24 Z" fill="white" fillOpacity="0.4" />
                            {/* Back End */}
                            <path d="M23.5 28.5 L28.5 23.5 L31 26 L26 31 Z" fill="#9ca3af" />
                            <path d="M26 31 L31 26 L30.5 25.5 L25.5 30.5 Z" fill="#6b7280" />
                        </svg>
                    ) : (
                        /* Pencil SVG */
                        <svg className="absolute top-0 left-0" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            {/* Graphite Tip */}
                            <path d="M0 0 L3.5 8.5 L8.5 3.5 Z" fill="#1f2937" />
                            {/* Wood Section */}
                            <path d="M3.5 8.5 L8.5 3.5 L12 7 L7 12 Z" fill="#fde68a" />
                            {/* Main Body (Yellow) */}
                            <path d="M7 12 L12 7 L26 21 L21 26 Z" fill="#fbbf24" stroke="#d97706" strokeWidth="0.5" />
                            {/* Highlight */}
                            <path d="M9 10 L10 9 L24 23 L23 24 Z" fill="white" fillOpacity="0.4" />
                            {/* Ferrule (Metal) */}
                            <path d="M21 26 L26 21 L29 24 L24 29 Z" fill="#9ca3af" stroke="#4b5563" strokeWidth="0.5" />
                            {/* Eraser */}
                            <path d="M24 29 L29 24 L33 28 L28 33 Z" fill="#f87171" stroke="#dc2626" strokeWidth="0.5" />
                        </svg>
                    )}
                </div>
            </div>
        </div>
    );
}
