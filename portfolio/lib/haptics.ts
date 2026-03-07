"use client";

import { useCallback, useEffect, useRef } from "react";
import type { HapticInput } from "web-haptics";
import { useWebHaptics } from "web-haptics/react";

const HAPTICS_OPTIONS = {
    debug: false,
    showSwitch: false,
} as const;

const DEFAULT_MIN_INTERVAL_MS = 45;

type InteractionMode = "unknown" | "keyboard" | "mouse" | "pen" | "touch";

let lastInteractionMode: InteractionMode = "unknown";
let lastInteractionTime = 0;
let listenersAttached = false;

function installInteractionTracking() {
    if (listenersAttached || typeof window === "undefined") {
        return;
    }

    const setMode = (mode: InteractionMode) => {
        lastInteractionMode = mode;
        lastInteractionTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    };

    window.addEventListener("pointerdown", (event) => {
        const pointerType = event.pointerType;
        if (pointerType === "touch" || pointerType === "pen" || pointerType === "mouse") {
            setMode(pointerType);
        }
    }, { passive: true, capture: true });

    window.addEventListener("touchstart", () => {
        setMode("touch");
    }, { passive: true, capture: true });

    window.addEventListener("keydown", () => {
        setMode("keyboard");
    }, { passive: true, capture: true });

    listenersAttached = true;
}

function canUseRuntimeHaptics(): boolean {
    if (typeof window === "undefined") {
        return false;
    }

    if (document.visibilityState !== "visible") {
        return false;
    }

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - lastInteractionTime > 2500) {
        return false;
    }

    return lastInteractionMode === "touch" || lastInteractionMode === "pen";
}

export function useAppHaptics() {
    const { trigger, cancel, isSupported } = useWebHaptics(HAPTICS_OPTIONS);
    const lastTriggerTimesRef = useRef<Record<string, number>>({});

    useEffect(() => {
        installInteractionTracking();
    }, []);

    const fire = useCallback((input: HapticInput = "medium", minIntervalMs = DEFAULT_MIN_INTERVAL_MS, channel = typeof input === "string" ? input : "custom") => {
        if (!isSupported || !canUseRuntimeHaptics()) {
            return;
        }

        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const lastTriggerTime = lastTriggerTimesRef.current[channel] ?? 0;
        if (now - lastTriggerTime < minIntervalMs) {
            return;
        }

        lastTriggerTimesRef.current[channel] = now;
        void trigger(input);
    }, [isSupported, trigger]);

    const subtle = useCallback(() => {
        fire("light", 30, "subtle");
    }, [fire]);

    const lightTap = useCallback(() => {
        fire("light", 35, "lightTap");
    }, [fire]);

    const tap = useCallback(() => {
        fire("medium", 45, "tap");
    }, [fire]);

    const selection = useCallback(() => {
        fire("selection", 40, "selection");
    }, [fire]);

    const heavyTap = useCallback(() => {
        fire("heavy", 65, "heavyTap");
    }, [fire]);

    const navigate = useCallback(() => {
        fire("selection", 45, "navigate");
    }, [fire]);

    const toggle = useCallback(() => {
        fire("selection", 45, "toggle");
    }, [fire]);

    const openPanel = useCallback(() => {
        fire("medium", 55, "openPanel");
    }, [fire]);

    const closePanel = useCallback(() => {
        fire("light", 45, "closePanel");
    }, [fire]);

    const externalLink = useCallback(() => {
        fire("light", 45, "externalLink");
    }, [fire]);

    const submit = useCallback(() => {
        fire("medium", 55, "submit");
    }, [fire]);

    const clear = useCallback(() => {
        fire("light", 60, "clear");
    }, [fire]);

    const success = useCallback(() => {
        fire("success", 120, "success");
    }, [fire]);

    const warning = useCallback(() => {
        fire("warning", 140, "warning");
    }, [fire]);

    const error = useCallback(() => {
        fire("error", 160, "error");
    }, [fire]);

    return {
        cancel,
        clear,
        closePanel,
        error,
        externalLink,
        fire,
        heavyTap,
        isSupported,
        lightTap,
        navigate,
        openPanel,
        selection,
        submit,
        subtle,
        success,
        tap,
        toggle,
        warning,
    };
}