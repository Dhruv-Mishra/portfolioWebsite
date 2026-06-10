/**
 * Per-navigation page wrapper. Replaces a previous framer-motion fade so the
 * motion runtime is not on the critical path of every navigation. The fade
 * is implemented as a pure CSS keyframe (`pageTemplateIn`) defined in
 * `app/globals.css` — opacity 0 → 1, no transform, so it cannot cause CLS.
 * Keep this as a server component so every route does not pay for a router
 * hook just to choose shell padding. Routes that need full-bleed treatment
 * compensate locally.
 */
export default function Template({ children }: { children: React.ReactNode }) {
    return (
        <div
            className="h-full min-w-0 max-w-full animate-page-template-in overflow-y-auto overflow-x-clip px-3 py-6 sm:px-5 sm:py-8 md:p-12 ruler-scrollbar"
        >
            {children}
        </div>
    );
}
