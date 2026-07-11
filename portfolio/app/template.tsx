import PageTurnSurface from '@/components/PageTurnSurface';

/**
 * Per-navigation page wrapper. Keep this as a server component so every
 * route does not move scroll ownership into client state. The outer element
 * owns scrolling and route padding; a tiny pathname-keyed client boundary
 * guarantees the CSS paper surface is replaced on each route change.
 */
export default function Template({ children }: { children: React.ReactNode }) {
    return (
        <div
            className="h-full min-h-full min-w-0 max-w-full overflow-y-auto overflow-x-clip px-3 py-6 sm:px-5 sm:py-8 md:p-12 ruler-scrollbar"
        >
            <PageTurnSurface>{children}</PageTurnSurface>
        </div>
    );
}
