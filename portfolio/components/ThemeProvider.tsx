"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { LazyMotion, domAnimation } from "framer-motion";
import { StyleProvider } from "@/context/StyleContext";

export function ThemeProvider({
    children,
    ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
    return (
        <NextThemesProvider {...props}>
            <StyleProvider>
                <LazyMotion features={domAnimation} strict>
                    {children}
                </LazyMotion>
            </StyleProvider>
        </NextThemesProvider>
    );
}
