"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { LAYOUT_TOKENS } from "@/lib/designTokens";

const SketchbookCursor = dynamic(() => import("@/components/SketchbookCursor"), { ssr: false });
const StickerToastListener = dynamic(() => import("@/components/StickerToastListener"), { ssr: false });
const StickerGlanceBadge = dynamic(() => import("@/components/StickerGlanceBadge"), { ssr: false });
const SuperuserToastController = dynamic(() => import("@/components/superuser/SuperuserToastController"), { ssr: false });
const MatrixNotesEntryButton = dynamic(() => import("@/components/matrix/MatrixNotesEntryButton"), { ssr: false });
const EscapeToastListener = dynamic(() => import("@/components/matrix/EscapeToastListener"), { ssr: false });
const AssetPrefetchController = dynamic(() => import("@/components/AssetPrefetchController"), { ssr: false });

const ROUTE_STABILITY_DELAY_MS = 600;
const INTER_STAGE_YIELD_MS = 150;

export default function DeferredEnhancements() {
    const pathname = usePathname();
    const [mountStage, setMountStage] = useState(0);
    const mountedStageRef = useRef(0);
    const [isCursorEligible, setIsCursorEligible] = useState(false);

    useEffect(() => {
        if (mountedStageRef.current >= 3) return;
        const runtimeWindow = window as Window & {
            requestIdleCallback?: typeof window.requestIdleCallback;
            cancelIdleCallback?: typeof window.cancelIdleCallback;
        };
        let cancelled = false;
        let stabilityTimer: number | undefined;
        let yieldTimer: number | undefined;
        let idleId: number | undefined;

        const scheduleNextStage = () => {
            const stage = mountedStageRef.current + 1;
            if (cancelled || stage > 3) return;

            const mountNextStage = () => {
                idleId = undefined;
                yieldTimer = undefined;
                if (cancelled) return;

                mountedStageRef.current = stage;
                setMountStage((current) => Math.max(current, stage));

                if (stage < 3) {
                    yieldTimer = runtimeWindow.setTimeout(() => {
                        yieldTimer = undefined;
                        scheduleNextStage();
                    }, INTER_STAGE_YIELD_MS);
                }
            };

            if (runtimeWindow.requestIdleCallback) {
                idleId = runtimeWindow.requestIdleCallback(mountNextStage);
                return;
            }

            yieldTimer = runtimeWindow.setTimeout(mountNextStage, INTER_STAGE_YIELD_MS);
        };

        stabilityTimer = runtimeWindow.setTimeout(() => {
            stabilityTimer = undefined;
            scheduleNextStage();
        }, ROUTE_STABILITY_DELAY_MS);

        return () => {
            cancelled = true;
            if (stabilityTimer !== undefined) runtimeWindow.clearTimeout(stabilityTimer);
            if (yieldTimer !== undefined) runtimeWindow.clearTimeout(yieldTimer);
            if (idleId !== undefined) runtimeWindow.cancelIdleCallback?.(idleId);
        };
    }, [pathname]);

    useEffect(() => {
        const mediaQuery = window.matchMedia(`(min-width: ${LAYOUT_TOKENS.mobileBreakpoint}px) and (hover: hover) and (pointer: fine)`);
        const syncCursorEligibility = () => setIsCursorEligible(mediaQuery.matches);

        syncCursorEligibility();
        mediaQuery.addEventListener("change", syncCursorEligibility);

        return () => mediaQuery.removeEventListener("change", syncCursorEligibility);
    }, []);

    if (mountStage === 0) {
        return null;
    }

    return (
        <>
            {isCursorEligible ? <SketchbookCursor /> : null}
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
        </>
    );
}
