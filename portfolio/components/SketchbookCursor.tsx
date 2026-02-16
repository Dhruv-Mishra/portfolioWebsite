"use client";
import { useEffect, useState, useRef } from 'react';
import { m, useMotionValue } from 'framer-motion';
import { MOBILE_BREAKPOINT } from '@/lib/constants';

import { useTheme } from 'next-themes';

// Trail point with timestamp for time-based aging (framerate-independent)
interface TrailPoint { x: number; y: number; t: number }

// Pre-allocated ring buffer for trail points — zero GC pressure
const MAX_POINTS = 128;

export default function SketchbookCursor() {
    const cursorRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isHoveringLink, setIsHoveringLink] = useState(false);
    const { resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    const [isVisible, setIsVisible] = useState(true);

    // Use a ref to access the latest theme inside the animation loop without restarting it
    const themeRef = useRef(resolvedTheme);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Valid hydration pattern for Next.js
    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        themeRef.current = resolvedTheme;
    }, [resolvedTheme]);

    // Mouse position state
    const mouseX = useMotionValue(-100);
    const mouseY = useMotionValue(-100);

    // Ring buffer for trail points — fixed-size, no allocations during render
    const ringRef = useRef<TrailPoint[]>(new Array(MAX_POINTS));
    const headRef = useRef(0);  // next write index
    const tailRef = useRef(0);  // oldest live index
    const lastMoveTime = useRef(0);
    const isVisibleRef = useRef(true);
    const rafIdRef = useRef<number>(0);   // 0 = stopped
    const dprRef = useRef(1);             // cached devicePixelRatio

    // Keep isVisibleRef in sync without restarting the effect
    useEffect(() => {
        isVisibleRef.current = isVisible;
    }, [isVisible]);

    useEffect(() => {
        lastMoveTime.current = Date.now(); // Initialize on mount
        if (!mounted) return;

        // Don't run on mobile
        if (window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches) return;

        const ring = ringRef.current;
        dprRef.current = window.devicePixelRatio || 1;

        // ─── Wake the rAF loop if it's sleeping ───
        const wakeLoop = () => {
            if (rafIdRef.current === 0) {
                rafIdRef.current = requestAnimationFrame(renderTrail);
            }
        };

        const moveCursor = (e: MouseEvent) => {
            mouseX.set(e.clientX);
            mouseY.set(e.clientY);
            const now = performance.now();
            lastMoveTime.current = now;

            // Distance-based throttling against last written point
            const prevIdx = (headRef.current - 1 + MAX_POINTS) % MAX_POINTS;
            const prev = headRef.current !== tailRef.current ? ring[prevIdx] : null;
            const dx = prev ? e.clientX - prev.x : Infinity;
            const dy = prev ? e.clientY - prev.y : Infinity;
            const dist2 = dx * dx + dy * dy; // avoid sqrt

            // Min 5px (25 sq), Max 80px (6400 sq)
            if (dist2 > 25 && dist2 < 6400) {
                const idx = headRef.current;
                // Reuse or create point object in ring slot
                if (ring[idx]) {
                    ring[idx].x = e.clientX;
                    ring[idx].y = e.clientY;
                    ring[idx].t = now;
                } else {
                    ring[idx] = { x: e.clientX, y: e.clientY, t: now };
                }
                headRef.current = (idx + 1) % MAX_POINTS;
                // If head catches tail, advance tail (drop oldest point)
                if (headRef.current === tailRef.current) {
                    tailRef.current = (tailRef.current + 1) % MAX_POINTS;
                }
            } else if (dist2 >= 6400) {
                // Large jump — clear trail, start fresh
                tailRef.current = headRef.current;
                const idx = headRef.current;
                if (ring[idx]) {
                    ring[idx].x = e.clientX;
                    ring[idx].y = e.clientY;
                    ring[idx].t = now;
                } else {
                    ring[idx] = { x: e.clientX, y: e.clientY, t: now };
                }
                headRef.current = (idx + 1) % MAX_POINTS;
            }

            // Ensure the render loop is running whenever the mouse moves
            wakeLoop();
        };

        const checkHover = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Check for links, buttons, or inputs
            if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.tagName === 'INPUT' ||
                target.closest('a') || target.closest('button')) {
                setIsHoveringLink(true);
            } else {
                setIsHoveringLink(false);
            }
        };

        const handleMouseLeave = () => setIsVisible(false);
        const handleMouseEnter = () => setIsVisible(true);

        // Custom events for explicit control (e.g., from Resume page to hide cursor over interactive PDF)
        const handleHideCursor = () => setIsVisible(false);
        const handleShowCursor = () => setIsVisible(true);

        let resizeTimer: ReturnType<typeof setTimeout>;
        const handleResize = () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (canvasRef.current) {
                    const dpr = window.devicePixelRatio || 1;
                    dprRef.current = dpr;
                    canvasRef.current.width = window.innerWidth * dpr;
                    canvasRef.current.height = window.innerHeight * dpr;
                    canvasRef.current.style.width = window.innerWidth + 'px';
                    canvasRef.current.style.height = window.innerHeight + 'px';
                    const ctx = canvasRef.current.getContext('2d');
                    ctx?.scale(dpr, dpr);
                }
            }, 100);
        };

        window.addEventListener('mousemove', moveCursor, { passive: true });
        window.addEventListener('mouseover', checkHover, { passive: true });
        // Use single listener on document (captures mouseleave from window too)
        document.addEventListener('mouseleave', handleMouseLeave);
        document.addEventListener('mouseenter', handleMouseEnter);
        window.addEventListener('sketchbook:hideCursor', handleHideCursor);
        window.addEventListener('sketchbook:showCursor', handleShowCursor);
        window.addEventListener('resize', handleResize, { passive: true });

        // Initial resize
        handleResize();

        // Canvas Drawing Loop — self-stopping: sleeps when idle, woken by mousemove
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { alpha: true });

        // Trail lifetime in ms — time-based so it's framerate-independent
        const TRAIL_LIFE_DARK = 60;    // chalk: very short trail
        const TRAIL_LIFE_LIGHT = 80;   // pencil: short trail

        const renderTrail = () => {
            rafIdRef.current = 0; // mark as not-scheduled until we re-schedule below
            if (!canvas || !ctx) return;

            const now = performance.now();
            let tail = tailRef.current;
            const head = headRef.current;

            const dpr = dprRef.current;

            // Clear canvas
            ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

            const isDark = themeRef.current === 'dark';
            const trailLife = isDark ? TRAIL_LIFE_DARK : TRAIL_LIFE_LIGHT;

            // Expire old points from tail
            while (tail !== head) {
                if (now - ring[tail].t > trailLife) {
                    tail = (tail + 1) % MAX_POINTS;
                } else {
                    break;
                }
            }
            tailRef.current = tail;

            // Single-path draw: 1 beginPath + 1 stroke = 1 GPU draw call
            const count = (head - tail + MAX_POINTS) % MAX_POINTS;
            if (count > 1) {
                ctx.beginPath();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                if (isDark) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
                    ctx.lineWidth = 4;
                } else {
                    ctx.strokeStyle = 'rgba(60,60,60,0.12)';
                    ctx.lineWidth = 2;
                }

                // Start from oldest live point
                const p0 = ring[tail];
                ctx.moveTo(p0.x, p0.y);

                let i = (tail + 1) % MAX_POINTS;
                let prev = p0;

                while (i !== head) {
                    const pt = ring[i];
                    // Quadratic bezier through midpoints for smooth curves
                    const mx = (prev.x + pt.x) * 0.5;
                    const my = (prev.y + pt.y) * 0.5;
                    ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
                    prev = pt;
                    i = (i + 1) % MAX_POINTS;
                }
                // Final segment to last point
                ctx.lineTo(prev.x, prev.y);
                ctx.stroke();
            }

            // Self-stop: if trail is empty and cursor idle, let the loop sleep.
            // The next mousemove will call wakeLoop() to restart it.
            const activePoints = (head - tail + MAX_POINTS) % MAX_POINTS;
            if (activePoints === 0 && now - lastMoveTime.current > 200) {
                // Loop stops — zero CPU while idle
                return;
            }

            rafIdRef.current = requestAnimationFrame(renderTrail);
        };

        // Start the loop (will self-stop once idle)
        wakeLoop();

        return () => {
            window.removeEventListener('mousemove', moveCursor);
            window.removeEventListener('mouseover', checkHover);
            document.removeEventListener('mouseleave', handleMouseLeave);
            document.removeEventListener('mouseenter', handleMouseEnter);
            window.removeEventListener('sketchbook:hideCursor', handleHideCursor);
            window.removeEventListener('sketchbook:showCursor', handleShowCursor);
            window.removeEventListener('resize', handleResize);
            clearTimeout(resizeTimer);
            if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        };
    }, [mouseX, mouseY, mounted]); // isVisible tracked via ref to avoid effect restart

    if (!mounted) return null;

    return (
        <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden hidden md:block">
            {/* Trail Canvas */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 pointer-events-none"
            />

            {/* Cursor Item (Pencil or Chalk) */}
            <m.div
                ref={cursorRef}
                initial={{ opacity: 0 }}
                animate={{
                    opacity: isVisible ? 1 : 0,
                    scale: isVisible ? 1 : 0.8
                }}
                style={{
                    x: mouseX, // Direct mapping
                    y: mouseY, // Direct mapping
                    rotate: isHoveringLink ? -20 : 0,
                }}
                className="absolute top-0 left-0"
            >
                <div className="w-8 h-8 md:w-10 md:h-10" style={{ transform: resolvedTheme === 'dark' ? 'translate(-2px, -9px)' : 'translate(0, 0)' }}>
                    {resolvedTheme === 'dark' ? (
                        /* Chalk Stick SVG */
                        <svg className="absolute top-0 left-0" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            {/* Chalk Stick Body */}
                            <path d="M2.5 9.5 L9.5 2.5 L24.5 17.5 L17.5 24.5 Z" fill="#e5e7eb" />
                            {/* Chalk Shadings/Texture */}
                            <path d="M5 8 L8 5 L10 7 L7 10 Z" fill="#d1d5db" />
                            <path d="M12 15 L15 12 L20 17 L17 20 Z" fill="#f3f4f6" opacity="0.5" />

                            {/* Tip (Jagged/Worn) */}
                            <path d="M0 7 L3 10 L2.5 9.5 L0 7Z" fill="#e5e7eb" />
                            <path d="M0 7 L2.5 9.5 L3.5 8.5 L0 7Z" fill="#d1d5db" />

                            {/* Back End */}
                            <path d="M24.5 17.5 L17.5 24.5 L19.5 26.5 L26.5 19.5 Z" fill="#9ca3af" />
                            <path d="M19.5 26.5 L26.5 19.5 L26 19 L19 26 Z" fill="#6b7280" />
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
            </m.div>
        </div>
    );
}
