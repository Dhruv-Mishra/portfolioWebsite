/**
 * Keep the App Router template transparent. The persistent root layout owns
 * the page-turn host so reserved chrome and route switching stay outside this
 * per-navigation remount.
 */
export default function Template({ children }: { children: React.ReactNode }) {
    return children;
}
