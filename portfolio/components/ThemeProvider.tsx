"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { LazyMotion, MotionConfig } from "framer-motion";
import { loadMotionFeatures } from "@/components/motion/requestMotion";
import { useSitePrefs } from "@/hooks/useSitePrefs";

export function ThemeProvider({
    children,
    ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
    const { motionPreference } = useSitePrefs();
    const reducedMotion = motionPreference === "reduced"
        ? "always"
        : motionPreference === "full"
            ? "never"
            : "user";

    return (
        <NextThemesProvider {...props}>
            <LazyMotion features={loadMotionFeatures} strict>
                <MotionConfig reducedMotion={reducedMotion}>
                    {children}
                </MotionConfig>
            </LazyMotion>
        </NextThemesProvider>
    );
}
