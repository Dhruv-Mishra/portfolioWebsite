"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { LAYOUT_TOKENS } from "@/lib/designTokens";

const MiniChat = dynamic(() => import("@/components/MiniChat"), { ssr: false });
const SketchbookCursorLoader = dynamic(() => import("@/components/SketchbookCursorLoader"), { ssr: false });

export default function DeferredEnhancements() {
    const pathname = usePathname();
    const [isReady, setIsReady] = useState(false);
    const [isDesktop, setIsDesktop] = useState(false);

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

    useEffect(() => {
        const mediaQuery = window.matchMedia(`(min-width: ${LAYOUT_TOKENS.mobileBreakpoint}px)`);
        const syncDesktopState = () => setIsDesktop(mediaQuery.matches);

        syncDesktopState();
        mediaQuery.addEventListener("change", syncDesktopState);

        return () => mediaQuery.removeEventListener("change", syncDesktopState);
    }, []);

    if (!isReady) {
        return null;
    }

    return (
        <>
            {isDesktop ? <SketchbookCursorLoader /> : null}
            {pathname !== "/chat" ? <MiniChat /> : null}
        </>
    );
}