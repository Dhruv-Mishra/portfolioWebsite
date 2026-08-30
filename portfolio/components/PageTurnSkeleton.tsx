import { normalizePageTurnPath } from '@/lib/pageTurn';
import { cn } from '@/lib/utils';

interface PageTurnSkeletonProps {
  label: string;
  pathname?: string;
}

function Tape({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('absolute h-2 w-10 rounded-[1px] bg-[var(--tape-color)]', className)}
    />
  );
}

function ShimmerBar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded-md page-route-shimmer motion-safe:animate-pulse', className)}
    />
  );
}

function FoldedNote({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative min-h-[8rem] rounded-sm border border-[var(--c-grid)]/40 bg-[var(--note-paper)] p-4 shadow-sm',
        className,
      )}
    >
      <Tape className="-top-1 left-3 -rotate-6" />
      <ShimmerBar className="mt-3 h-3 w-3/5 bg-[var(--c-ink)]/10" />
      <ShimmerBar className="mt-2 h-2.5 w-full bg-[var(--c-ink)]/10" />
      <ShimmerBar className="mt-2 h-2.5 w-4/5 bg-[var(--c-ink)]/10" />
    </div>
  );
}

export function PageRouteSkeleton({ pathname }: { pathname: string }) {
  const route = normalizePageTurnPath(pathname);

  if (route === '/') {
    return (
      <div className="mx-auto flex min-h-full w-full flex-col items-center py-2">
        <ShimmerBar className="h-24 w-3/5 max-w-[32.5rem] bg-[var(--c-heading)]/15 md:h-40" />
        <ShimmerBar className="mt-7 h-32 w-full max-w-lg bg-[var(--c-ink)]/10 md:h-36" />
        <ShimmerBar className="mt-9 h-12 w-40 bg-[var(--c-heading)]/15" />
        <div className="mt-14 h-[var(--c-terminal-h)] min-h-[var(--c-terminal-min-h)] w-full max-w-2xl rounded-md bg-[var(--c-ink)]/85 md:h-[var(--c-terminal-h-md)]" />
      </div>
    );
  }

  if (route === '/projects' || route.startsWith('/projects/')) {
    return (
      <div className="flex h-full w-full flex-col">
        <ShimmerBar className="ml-6 h-10 w-48 -rotate-1 bg-[var(--c-heading)]/15 md:h-[3.75rem] md:w-64" />
        <div className="mt-[4.5rem] grid grid-cols-1 gap-8 px-6 md:grid-cols-2 md:gap-14 lg:grid-cols-3">
          <FoldedNote className="min-h-80 -rotate-1 md:min-h-[450px]" />
          <FoldedNote className="hidden min-h-[450px] rotate-1 md:block" />
          <FoldedNote className="hidden min-h-[450px] -rotate-2 lg:block" />
        </div>
      </div>
    );
  }

  if (route === '/about') {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-1.5 py-2 pb-8 sm:px-0">
        <div className="relative mx-auto w-full max-w-4xl md:px-3">
          <div className="relative min-h-full rounded-sm bg-[var(--note-paper)] p-4 shadow-md sm:p-6 md:p-12">
            <Tape className="-top-1 left-3 w-24 -rotate-8 md:-left-6 md:w-32" />
            <ShimmerBar className="h-12 w-2/5 bg-[var(--c-heading)]/15 md:h-[4.5rem]" />
            <ShimmerBar className="mt-6 h-72 w-full bg-[var(--c-ink)]/10 md:h-40" />
            <div className="mt-6 flex justify-center md:justify-end">
              <ShimmerBar className="h-40 w-40 bg-[var(--c-ink)]/10 md:h-48 md:w-48" />
            </div>
            <ShimmerBar className="mt-8 h-3 w-full bg-[var(--c-ink)]/10" />
            <ShimmerBar className="mt-4 h-3 w-11/12 bg-[var(--c-ink)]/10" />
            <ShimmerBar className="mt-4 h-3 w-4/5 bg-[var(--c-ink)]/10" />
          </div>
        </div>
      </div>
    );
  }

  if (route === '/resume') {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center px-1 py-2 pb-8 sm:px-4 md:min-h-[36rem] md:px-12">
        <ShimmerBar className="mb-4 h-12 w-48 bg-[var(--c-heading)]/15" />
        <div className="relative h-full min-h-[22rem] w-full max-w-5xl -rotate-1 bg-[var(--c-paper)] shadow-md md:min-h-[32rem]">
          <Tape className="absolute -top-3 -left-6 w-24 -rotate-[25deg]" />
          <Tape className="absolute -top-4 -right-6 w-24 rotate-[20deg]" />
          <Tape className="absolute -bottom-4 left-1/2 w-28 -translate-x-1/2 rotate-[2deg]" />
          <div className="flex h-full flex-col gap-3 p-8">
            <ShimmerBar className="h-6 w-1/3 bg-[var(--c-heading)]/15" />
            <ShimmerBar className="h-3 w-full bg-[var(--c-ink)]/10" />
            <ShimmerBar className="h-3 w-5/6 bg-[var(--c-ink)]/10" />
            <ShimmerBar className="mt-4 h-40 w-full bg-[var(--c-ink)]/8" />
          </div>
        </div>
      </div>
    );
  }

  if (route === '/chat' || route.startsWith('/chat/')) {
    return (
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
        <ShimmerBar className="mx-auto mt-2 h-10 w-40 bg-[var(--c-heading)]/15 md:mt-8 md:h-14 md:w-64" />
        <div className="mt-12 flex flex-1 flex-col gap-5 px-7 md:px-8">
          <FoldedNote className="min-h-[7.5rem] max-w-md -rotate-1 self-start bg-[var(--note-ai)]" />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <ShimmerBar className="h-12 bg-[var(--c-ink)]/10" />
            <ShimmerBar className="h-12 bg-[var(--c-ink)]/10" />
            <ShimmerBar className="h-12 bg-[var(--c-ink)]/10" />
          </div>
        </div>
        <FoldedNote className="mx-2 mt-auto min-h-[4rem] rotate-0" />
      </div>
    );
  }

  if (route === '/guestbook') {
    return (
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col px-4 pb-8 pt-2 md:px-8">
        <div className="text-center">
          <ShimmerBar className="mx-auto h-10 w-36 bg-[var(--c-heading)]/15 md:h-12 md:w-44" />
          <ShimmerBar className="mx-auto mt-4 h-5 w-64 bg-[var(--c-ink)]/10" />
        </div>
        <FoldedNote className="mx-auto mt-8 min-h-[18rem] w-full max-w-xl md:mt-10" />
        <div className="mt-12 columns-1 gap-10 sm:columns-2 md:gap-14 lg:columns-3 xl:columns-4">
          <FoldedNote className="mb-10 min-h-40 -rotate-1 break-inside-avoid" />
          <FoldedNote className="mb-10 hidden min-h-40 rotate-1 break-inside-avoid sm:block" />
          <FoldedNote className="mb-10 hidden min-h-40 -rotate-2 break-inside-avoid lg:block" />
          <FoldedNote className="mb-10 hidden min-h-40 rotate-1 break-inside-avoid xl:block" />
        </div>
      </div>
    );
  }

  if (route === '/stickers') {
    return (
      <div className="min-h-full px-4 pb-8 pt-2 md:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <div className="text-center">
            <ShimmerBar className="mx-auto h-10 w-64 bg-[var(--c-heading)]/15 md:h-[3.75rem] md:w-96" />
            <ShimmerBar className="mx-auto mt-4 h-5 w-56 bg-[var(--c-ink)]/10" />
            <FoldedNote className="mx-auto mt-7 min-h-20 w-36 rotate-0 md:w-44" />
            <ShimmerBar className="mx-auto mt-7 h-5 w-52 bg-[var(--c-ink)]/10" />
          </div>
          <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 md:gap-8 lg:grid-cols-5">
          {Array.from({ length: 12 }, (_, index) => (
            <div
              key={index}
              className="min-h-44 rounded-md border border-[var(--c-grid)]/35 bg-[var(--note-paper)] page-route-shimmer lg:min-h-48"
            />
          ))}
          </div>
        </div>
      </div>
    );
  }

  if (route === '/settings') {
    return (
      <div className="relative mx-auto min-h-full w-full max-w-3xl pb-8 pl-4 pr-14 pt-2 md:px-8">
        <Tape className="relative left-1/2 top-0 h-2 w-16 -translate-x-1/2 rotate-2" />
        <ShimmerBar className="mx-auto mt-2 h-10 w-40 bg-[var(--c-heading)]/15 md:h-[3.75rem] md:w-56" />
        <div className="mt-8 border-y-2 border-dashed border-[var(--c-grid)]/45 py-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="border-b border-dashed border-[var(--c-grid)]/35 py-6">
              <ShimmerBar className="h-5 w-1/3 bg-[var(--c-ink)]/10" />
              <ShimmerBar className="mt-5 h-12 w-full bg-[var(--c-ink)]/8" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-[16rem] w-full max-w-3xl flex-col gap-4 rounded-lg border-2 border-dashed border-[var(--c-grid)] bg-note-paper p-6 shadow-md md:p-8">
      <ShimmerBar className="h-7 w-2/5 bg-[var(--c-ink)]/10" />
      <ShimmerBar className="h-3 w-full bg-[var(--c-ink)]/10" />
      <ShimmerBar className="h-3 w-11/12 bg-[var(--c-ink)]/10" />
      <ShimmerBar className="h-3 w-4/5 bg-[var(--c-ink)]/10" />
      <ShimmerBar className="mt-2 h-24 w-full bg-[var(--c-ink)]/10" />
    </div>
  );
}

export default function PageTurnSkeleton({ label, pathname = '/' }: PageTurnSkeletonProps) {
  const route = normalizePageTurnPath(pathname);
  const isChatRoute = route === '/chat' || route.startsWith('/chat/');

  return (
    <div
      data-page-turn-skeleton
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        'pointer-events-none absolute inset-0 z-20',
        isChatRoute
          ? 'pt-[var(--c-page-header-h)]'
          : 'px-3 sm:px-5 md:px-12 pt-[var(--c-page-header-h)] pb-[var(--c-page-footer-h)]',
      )}
      style={{ contentVisibility: 'auto', contain: 'layout paint' }}
    >
      <span className="sr-only">{`Opening ${label}`}</span>
      <PageRouteSkeleton pathname={pathname} />
    </div>
  );
}
