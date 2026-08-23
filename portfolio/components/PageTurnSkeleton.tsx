interface PageTurnSkeletonProps {
  label: string;
}

export default function PageTurnSkeleton({ label }: PageTurnSkeletonProps) {
  return (
    <div
      data-page-turn-skeleton
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="pointer-events-none absolute inset-0 z-20 bg-[var(--c-paper)] px-3 py-6 sm:px-5 sm:py-8 md:p-12"
    >
      <span className="sr-only">{`Opening ${label}`}</span>
      <div
        aria-hidden="true"
        className="animate-page-sheet mx-auto flex h-full min-h-[16rem] w-full max-w-3xl flex-col gap-4 rounded-lg border-2 border-dashed border-[var(--c-grid)] bg-note-paper p-6 font-hand shadow-md md:p-8"
      >
        <div className="h-7 w-2/5 rounded-md bg-[var(--c-ink)]/10 motion-safe:animate-pulse" />
        <div className="h-3 w-full rounded-md bg-[var(--c-ink)]/10 motion-safe:animate-pulse" />
        <div className="h-3 w-11/12 rounded-md bg-[var(--c-ink)]/10 motion-safe:animate-pulse" />
        <div className="h-3 w-4/5 rounded-md bg-[var(--c-ink)]/10 motion-safe:animate-pulse" />
        <div className="mt-2 h-24 w-full rounded-md bg-[var(--c-ink)]/10 motion-safe:animate-pulse" />
      </div>
    </div>
  );
}
