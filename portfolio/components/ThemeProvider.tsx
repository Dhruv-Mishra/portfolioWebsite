"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { LazyMotion, MotionConfig, domAnimation } from "framer-motion";

export function ThemeProvider({
    children,
    ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
    return (
        <NextThemesProvider {...props}>
            <LazyMotion features={domAnimation} strict>
                <MotionConfig reducedMotion="never">
                    {children}
                </MotionConfig>
            </LazyMotion>
        </NextThemesProvider>
    );
}
