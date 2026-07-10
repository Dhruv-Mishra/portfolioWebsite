/**
 * Per-navigation page wrapper. Keep this as a server component so every
 * route does not pay for a router or motion runtime. The outer element owns
 * scrolling and route padding; the inner surface handles the CSS page turn.
 */
export default function Template({ children }: { children: React.ReactNode }) {
    return (
        <div
            className="h-full min-h-full min-w-0 max-w-full overflow-y-auto overflow-x-clip px-3 py-6 sm:px-5 sm:py-8 md:p-12 ruler-scrollbar"
        >
            <div className="h-full min-h-full min-w-0 animate-page-template-in">
                {children}
            </div>
        </div>
    );
}
