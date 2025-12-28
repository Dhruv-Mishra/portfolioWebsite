"use client";
import React, { useEffect, useState, useRef } from 'react';
import { motion, useMotionValue } from 'framer-motion';

import { useTheme } from 'next-themes';

export default function SketchbookCursor() {
    const cursorRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isHoveringLink, setIsHoveringLink] = useState(false);
    const { theme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Mouse position state
    const mouseX = useMotionValue(-100);
    const mouseY = useMotionValue(-100);

    // Trail state
    const pointsRef = useRef<{ x: number, y: number, age: number }[]>([]);

    useEffect(() => {
        if (!mounted) return;

        const moveCursor = (e: MouseEvent) => {
            mouseX.set(e.clientX);
            mouseY.set(e.clientY);

            // Add point for trail
            pointsRef.current.push({ x: e.clientX, y: e.clientY, age: 0 });
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

        window.addEventListener('mousemove', moveCursor);
        window.addEventListener('mouseover', checkHover);

        // Canvas Drawing Loop
        let animationFrameId: number;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');

        const renderTrail = () => {
            if (!canvas || !ctx) return;

            // Resize canvas if needed
            if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }

            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Determine stroke style based on theme (resolvedTheme)
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

            // Draw trail
            ctx.beginPath();

            if (isDark) {
                // Chalk Style: Thick, Hazy, White
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 6;
                ctx.shadowBlur = 15;
                ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
            } else {
                // Pencil Style: Thin, Sharp, Graphite
                ctx.strokeStyle = 'rgba(60, 60, 60, 0.1)';
                ctx.lineWidth = 2;
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';
            }

            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (pointsRef.current.length > 1) {
                ctx.moveTo(pointsRef.current[0].x, pointsRef.current[0].y);

                for (let i = 1; i < pointsRef.current.length; i++) {
                    const point = pointsRef.current[i];
                    point.age += 1;

                    if (point.age > 10) { // Reduced Max Age
                        pointsRef.current.shift();
                        i--;
                        continue;
                    }

                    ctx.lineTo(point.x, point.y);
                }
                ctx.stroke();
            }

            animationFrameId = requestAnimationFrame(renderTrail);
        };

        renderTrail();

        return () => {
            window.removeEventListener('mousemove', moveCursor);
            window.removeEventListener('mouseover', checkHover);
            cancelAnimationFrame(animationFrameId);
        };
    }, [mouseX, mouseY, theme, mounted]); // Re-run effect when theme changes to update trail color reference

    if (!mounted) return null;

    return (
        <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
            {/* Trail Canvas */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 pointer-events-none"
            />

            {/* Cursor Item (Pencil or Chalk) */}
            <motion.div
                ref={cursorRef}
                style={{
                    x: mouseX, // Direct mapping
                    y: mouseY, // Direct mapping
                    rotate: isHoveringLink ? -20 : 0,
                }}
                className="absolute top-0 left-0"
            >
                <div className="w-8 h-8 md:w-10 md:h-10 drop-shadow-lg" style={{ transform: theme === 'dark' ? 'translate(-2px, -9px)' : 'translate(0, 0)' }}>
                    {theme === 'dark' ? (
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
            </motion.div>
        </div>
    );
}
