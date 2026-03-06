"use client";

import { useCallback } from "react";
import type { HapticInput } from "web-haptics";
import { useWebHaptics } from "web-haptics/react";

const HAPTICS_OPTIONS = {
    debug: false,
    showSwitch: false,
} as const;

export function useAppHaptics() {
    const { trigger, cancel, isSupported } = useWebHaptics(HAPTICS_OPTIONS);

    const fire = useCallback((input: HapticInput = "medium") => {
        void trigger(input);
    }, [trigger]);

    const lightTap = useCallback(() => {
        fire("light");
    }, [fire]);

    const tap = useCallback(() => {
        fire("medium");
    }, [fire]);

    const selection = useCallback(() => {
        fire("selection");
    }, [fire]);

    const success = useCallback(() => {
        fire("success");
    }, [fire]);

    return {
        cancel,
        fire,
        isSupported,
        lightTap,
        selection,
        success,
        tap,
    };
}