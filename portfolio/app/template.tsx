"use client";

import { usePathname } from "next/navigation";

const FULL_BLEED_ROUTES = ['/chat'];

/**
 * Per-navigation page wrapper. Replaces a previous framer-motion fade so the
 * motion runtime is not on the critical path of every navigation. The fade
 * is implemented as a pure CSS keyframe (`pageTemplateIn`) defined in
 * `app/globals.css` — opacity 0 → 1, no transform, so it cannot cause CLS.
 */
export default function Template({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const fullBleed = FULL_BLEED_ROUTES.includes(pathname);

    return (
        <div
            className={`h-full min-w-0 max-w-full animate-page-template-in ${fullBleed ? 'overflow-hidden' : 'overflow-y-auto overflow-x-clip px-3 py-6 sm:px-5 sm:py-8 md:p-12 ruler-scrollbar'}`}
        >
            {children}
        </div>
    );
}
