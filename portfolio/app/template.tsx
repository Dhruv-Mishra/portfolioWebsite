"use client";

import { m } from "framer-motion";
import { usePathname } from "next/navigation";

// Pages that should fade in without horizontal slide
const FADE_ONLY_ROUTES = ['/chat'];

// Pages that manage their own padding (full-bleed layout)
const FULL_BLEED_ROUTES = ['/chat'];

export default function Template({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const fadeOnly = FADE_ONLY_ROUTES.includes(pathname);
    const fullBleed = FULL_BLEED_ROUTES.includes(pathname);

    return (
        <m.div
            initial={{ opacity: 0, x: fadeOnly ? 0 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ease: "easeOut", duration: 0.3 }}
            className={`h-full ${fullBleed ? 'overflow-hidden' : 'overflow-y-auto p-8 md:p-12 ruler-scrollbar'}`}
        >
            {children}
        </m.div>
    );
}
