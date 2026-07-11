/**
 * Keep the App Router template transparent. The persistent root layout owns
 * the page-turn host so it can retain the previous route payload while this
 * per-navigation boundary remounts.
 */
export default function Template({ children }: { children: React.ReactNode }) {
    return children;
}
