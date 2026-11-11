"use client";

import { WebHaptics, type HapticInput } from "web-haptics";
import { getSitePrefsSnapshot } from "@/hooks/useSitePrefs";

// showSwitch: true keeps the <label>/<input switch> pair actually rendered
// (rather than display:none). iOS Safari only fires Taptic Engine haptics when
// a *rendered* switch is toggled — display:none kills that path. We hide the
// rendered element off-screen via CSS in globals.css.
const HAPTICS_OPTIONS = {
    debug: false,
    showSwitch: true,
} as const;

const DEFAULT_MIN_INTERVAL_MS = 45;

type InteractionMode = "unknown" | "keyboard" | "mouse" | "pen" | "touch";

let lastInteractionMode: InteractionMode = "unknown";
let lastInteractionTime = 0;
let listenersAttached = false;
let sharedEngine: WebHaptics | null = null;
const lastTriggerTimes: Record<string, number> = {};

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

if (typeof window !== "undefined") {
    installInteractionTracking();
}

interface HapticsGateInput {
    enabled: boolean;
    visibilityState: DocumentVisibilityState;
    interactionMode: InteractionMode;
    interactionAgeMs: number;
}

export function shouldAllowHaptics({
    enabled,
    visibilityState,
    interactionMode,
    interactionAgeMs,
}: HapticsGateInput): boolean {
    return enabled
        && visibilityState === "visible"
        && interactionAgeMs <= 2500
        && (interactionMode === "touch" || interactionMode === "pen");
}

function canUseRuntimeHaptics(): boolean {
    if (typeof window === "undefined") {
        return false;
    }
    installInteractionTracking();

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    return shouldAllowHaptics({
        enabled: getSitePrefsSnapshot().hapticsEnabled,
        visibilityState: document.visibilityState,
        interactionMode: lastInteractionMode,
        interactionAgeMs: now - lastInteractionTime,
    });
}

function getSharedEngine(): WebHaptics {
    sharedEngine ??= new WebHaptics(HAPTICS_OPTIONS);
    return sharedEngine;
}

// NOTE: we deliberately do NOT gate on `WebHaptics.isSupported`. `isSupported` only
// reports the Vibration API (Android); on iOS it returns false, but web-haptics
// internally falls through to a <label><input switch></label> click which triggers
// the Taptic Engine. Gating on `isSupported` would block that iOS path entirely.
function fire(
    input: HapticInput = "medium",
    minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
    channel = typeof input === "string" ? input : "custom",
): void {
    if (!canUseRuntimeHaptics()) {
        return;
    }

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const lastTriggerTime = lastTriggerTimes[channel] ?? 0;
    if (now - lastTriggerTime < minIntervalMs) {
        return;
    }

    lastTriggerTimes[channel] = now;
    void getSharedEngine().trigger(input);
}

function cancel(): void {
    sharedEngine?.cancel();
}

const APP_HAPTICS = {
    cancel,
    clear: () => fire("light", 60, "clear"),
    closePanel: () => fire("light", 45, "closePanel"),
    error: () => fire("error", 160, "error"),
    externalLink: () => fire("light", 45, "externalLink"),
    fire,
    heavyTap: () => fire("heavy", 65, "heavyTap"),
    get isSupported(): boolean {
        return WebHaptics.isSupported;
    },
    lightTap: () => fire("light", 35, "lightTap"),
    navigate: () => fire("selection", 45, "navigate"),
    openPanel: () => fire("medium", 55, "openPanel"),
    selection: () => fire("selection", 40, "selection"),
    submit: () => fire("medium", 55, "submit"),
    subtle: () => fire("light", 30, "subtle"),
    success: () => fire("success", 120, "success"),
    tap: () => fire("medium", 45, "tap"),
    toggle: () => fire("selection", 45, "toggle"),
    warning: () => fire("warning", 140, "warning"),
} as const;

export function useAppHaptics() {
    installInteractionTracking();
    return APP_HAPTICS;
}