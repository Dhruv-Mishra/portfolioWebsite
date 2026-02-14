import { useEffect } from 'react';
import { useMotionValue } from 'framer-motion';
import { MOBILE_BREAKPOINT } from '@/lib/constants';

export function useMousePosition() {
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    useEffect(() => {
        // Skip mouse tracking on mobile — no mouse, no parallax needed
        if (window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches) return;

        const handleMouseMove = (e: MouseEvent) => {
            x.set(e.clientX);
            y.set(e.clientY);
        };

        window.addEventListener("mousemove", handleMouseMove, { passive: true });
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, [x, y]);

    return { x, y };
}
