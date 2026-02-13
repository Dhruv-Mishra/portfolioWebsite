"use client";

import { LazyMotion, domAnimation, m } from "framer-motion";
import { usePathname } from "next/navigation";

// Pages that should fade in without horizontal slide
const FADE_ONLY_ROUTES = ['/chat'];

export default function Template({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const fadeOnly = FADE_ONLY_ROUTES.includes(pathname);

    return (
        <LazyMotion features={domAnimation}>
            <m.div
                initial={{ opacity: 0, x: fadeOnly ? 0 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ease: "easeOut", duration: 0.3 }}
                className="h-full overflow-y-auto p-8 md:p-12 scrollbar-thin scrollbar-thumb-gray-300"
            >
                {children}
            </m.div>
        </LazyMotion>
    );
}
