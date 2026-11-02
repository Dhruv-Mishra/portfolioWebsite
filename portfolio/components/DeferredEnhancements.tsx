"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { FINE_POINTER_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
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
const LAST_STAGE = 3;
const CURSOR_QUERY = `(min-width: ${LAYOUT_TOKENS.mobileBreakpoint}px) and ${FINE_POINTER_QUERY}`;

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const idle = () => new Promise<void>((resolve) => {
    if (window.requestIdleCallback) window.requestIdleCallback(() => resolve());
    else window.setTimeout(resolve, INTER_STAGE_YIELD_MS);
});

/** Mounts non-critical UI in idle stages once a route has been stable briefly; restarts on navigation. */
export default function DeferredEnhancements() {
    const pathname = usePathname();
    const [mountStage, setMountStage] = useState(0);
    const stageRef = useRef(0);
    const isCursorEligible = useMediaQuery(CURSOR_QUERY);

    useEffect(() => {
        if (stageRef.current >= LAST_STAGE) return;
        let cancelled = false;
        void (async () => {
            await delay(ROUTE_STABILITY_DELAY_MS);
            while (!cancelled && stageRef.current < LAST_STAGE) {
                await idle();
                if (cancelled) return;
                stageRef.current += 1;
                setMountStage(stageRef.current);
                await delay(INTER_STAGE_YIELD_MS);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [pathname]);

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
