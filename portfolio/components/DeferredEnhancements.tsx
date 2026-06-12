"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { LAYOUT_TOKENS } from "@/lib/designTokens";

const MiniChat = dynamic(() => import("@/components/MiniChat"), { ssr: false });
const SketchbookCursorLoader = dynamic(() => import("@/components/SketchbookCursorLoader"), { ssr: false });
const StickerToastListener = dynamic(() => import("@/components/StickerToastListener"), { ssr: false });
const StickerGlanceBadge = dynamic(() => import("@/components/StickerGlanceBadge"), { ssr: false });
const SuperuserToastController = dynamic(() => import("@/components/superuser/SuperuserToastController"), { ssr: false });
const MatrixNotesEntryButton = dynamic(() => import("@/components/matrix/MatrixNotesEntryButton"), { ssr: false });
const EscapeToastListener = dynamic(() => import("@/components/matrix/EscapeToastListener"), { ssr: false });
const AssetPrefetchController = dynamic(() => import("@/components/AssetPrefetchController"), { ssr: false });

export default function DeferredEnhancements() {
    const pathname = usePathname();
    const [mountStage, setMountStage] = useState(0);
    const [isDesktop, setIsDesktop] = useState(false);

    useEffect(() => {
        const runtimeWindow = window as Window & {
            requestIdleCallback?: typeof window.requestIdleCallback;
            cancelIdleCallback?: typeof window.cancelIdleCallback;
        };
        const timers = new Set<number>();
        const idleIds = new Set<number>();
        const schedule = (stage: number, delay: number, timeout: number) => {
            const run = () => setMountStage((current) => Math.max(current, stage));
            if (runtimeWindow.requestIdleCallback) {
                const timerId = runtimeWindow.setTimeout(() => {
                    timers.delete(timerId);
                    const idleId = runtimeWindow.requestIdleCallback?.(run, { timeout });
                    if (idleId !== undefined) idleIds.add(idleId);
                }, delay);
                timers.add(timerId);
                return;
            }
            const timerId = runtimeWindow.setTimeout(run, delay);
            timers.add(timerId);
        };

        schedule(1, 450, 900);
        schedule(2, 900, 1600);
        schedule(3, 1400, 2400);

        return () => {
            idleIds.forEach((idleId) => runtimeWindow.cancelIdleCallback?.(idleId));
            timers.forEach((timerId) => runtimeWindow.clearTimeout(timerId));
        };
    }, []);

    useEffect(() => {
        const mediaQuery = window.matchMedia(`(min-width: ${LAYOUT_TOKENS.mobileBreakpoint}px)`);
        const syncDesktopState = () => setIsDesktop(mediaQuery.matches);

        syncDesktopState();
        mediaQuery.addEventListener("change", syncDesktopState);

        return () => mediaQuery.removeEventListener("change", syncDesktopState);
    }, []);

    if (mountStage === 0) {
        return null;
    }

    return (
        <>
            {isDesktop ? <SketchbookCursorLoader /> : null}
            <StickerToastListener />
            <EscapeToastListener />
            {mountStage >= 2 ? (
                <>
                    <StickerGlanceBadge />
                    <SuperuserToastController />
                    <MatrixNotesEntryButton />
                </>
            ) : null}
            {mountStage >= 3 ? <AssetPrefetchController /> : null}
            {mountStage >= 2 && pathname !== "/chat" ? <MiniChat /> : null}
        </>
    );
}
