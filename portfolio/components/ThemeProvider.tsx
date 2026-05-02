"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { LazyMotion, MotionConfig } from "framer-motion";

// Async loader keeps the ~70KB raw / ~25KB gzip framer-motion `domAnimation`
// feature bundle out of the initial render-blocking chunk. The loader
// function is the documented pattern for true code-splitting of LazyMotion
// features — passing `domAnimation` directly co-bundles it with whatever
// chunk holds <LazyMotion>, which on this site is the global ThemeProvider
// (loaded on every route).
const loadDomAnimationFeatures = () =>
    import("./motion/lazy-features").then((mod) => mod.default);

export function ThemeProvider({
    children,
    ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
    return (
        <NextThemesProvider {...props}>
            <LazyMotion features={loadDomAnimationFeatures} strict>
                <MotionConfig reducedMotion="never">
                    {children}
                </MotionConfig>
            </LazyMotion>
        </NextThemesProvider>
    );
}
