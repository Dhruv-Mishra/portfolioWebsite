"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const MiniChat = dynamic(() => import("@/components/MiniChat"), { ssr: false });
const SketchbookCursorLoader = dynamic(() => import("@/components/SketchbookCursorLoader"), { ssr: false });

export default function DeferredEnhancements() {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const runtimeWindow = window as Window & {
            requestIdleCallback?: typeof window.requestIdleCallback;
            cancelIdleCallback?: typeof window.cancelIdleCallback;
        };
        const start = () => setIsReady(true);

        if (runtimeWindow.requestIdleCallback) {
            const idleId = runtimeWindow.requestIdleCallback(start, { timeout: 1500 });
            return () => runtimeWindow.cancelIdleCallback?.(idleId);
        }

        const timeoutId = runtimeWindow.setTimeout(start, 900);
        return () => runtimeWindow.clearTimeout(timeoutId);
    }, []);

    if (!isReady) {
        return null;
    }

    return (
        <>
            <SketchbookCursorLoader />
            <MiniChat />
        </>
    );
}