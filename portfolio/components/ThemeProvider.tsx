"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { LazyMotion, MotionConfig, domAnimation } from "framer-motion";

const FORCE_MOTION =
    process.env.NEXT_PUBLIC_OVERRIDE_REDUCED_MOTION === "true";

export function ThemeProvider({
    children,
    ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
    return (
        <NextThemesProvider {...props}>
            <LazyMotion features={domAnimation} strict>
                <MotionConfig
                    reducedMotion={FORCE_MOTION ? "never" : "user"}
                >
                    {children}
                </MotionConfig>
            </LazyMotion>
        </NextThemesProvider>
    );
}
