"use client";
import dynamic from 'next/dynamic';

// Client-side wrapper that enables ssr: false for SketchbookCursor.
// This defers the full cursor module (~363 LOC, rAF loop, canvas, framer-motion springs)
// from the initial bundle — mobile devices never download it since it self-bails via matchMedia.
const SketchbookCursor = dynamic(() => import('./SketchbookCursor'), { ssr: false });

export default function SketchbookCursorLoader() {
    return <SketchbookCursor />;
}
