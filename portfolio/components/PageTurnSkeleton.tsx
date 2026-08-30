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
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center gap-5 pt-4">
        <ShimmerBar className="h-10 w-3/5 max-w-md bg-[var(--c-heading)]/15 md:h-14" />
        <ShimmerBar className="h-4 w-4/5 max-w-lg bg-[var(--c-ink)]/10" />
        <div className="mt-2 flex w-full max-w-xl justify-center gap-3">
          <FoldedNote className="-rotate-2 w-24 min-h-[5.5rem]" />
          <FoldedNote className="rotate-1 w-24 min-h-[5.5rem]" />
          <FoldedNote className="-rotate-1 w-24 min-h-[5.5rem]" />
        </div>
        <div
          className="mt-2 w-full max-w-[var(--c-terminal-max-w)] rounded-md bg-[var(--c-ink)]/85"
          style={{ height: 'var(--c-terminal-h)', minHeight: 'var(--c-terminal-min-h)', maxHeight: 'var(--c-terminal-h-md)' }}
        />
      </div>
    );
  }

  if (route === '/projects' || route.startsWith('/projects/')) {
    return (
      <div className="flex h-full w-full flex-col">
        <ShimmerBar className="mb-8 h-9 w-48 -rotate-1 bg-[var(--c-heading)]/15 md:h-12 md:w-64" />
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-14 lg:grid-cols-3">
          <FoldedNote className="-rotate-1" />
          <FoldedNote className="rotate-1 hidden md:block" />
          <FoldedNote className="-rotate-2 hidden lg:block" />
        </div>
      </div>
    );
  }

  if (route === '/about') {
    return (
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-6">
        <div className="relative min-h-[16rem] rounded-sm bg-[var(--note-paper)] p-6 shadow-md md:p-8">
          <Tape className="-top-1 left-4 -rotate-8" />
          <ShimmerBar className="h-8 w-2/5 bg-[var(--c-heading)]/15" />
          <ShimmerBar className="mt-4 h-3 w-full bg-[var(--c-ink)]/10" />
          <ShimmerBar className="mt-2 h-3 w-11/12 bg-[var(--c-ink)]/10" />
          <ShimmerBar className="mt-2 h-3 w-4/5 bg-[var(--c-ink)]/10" />
        </div>
        <div className="flex gap-4">
          <div className="w-1 shrink-0 rounded-full bg-[var(--c-grid)]/70" />
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
            <FoldedNote className="-rotate-1" />
            <FoldedNote className="rotate-1" />
          </div>
        </div>
      </div>
    );
  }

  if (route === '/resume') {
    return (
      <div className="flex h-full min-h-[22rem] items-center justify-center">
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
        <ShimmerBar className="mx-auto mt-2 h-8 w-48 bg-[var(--c-heading)]/15 md:h-10" />
        <div className="mt-6 flex flex-1 flex-col gap-5 px-2">
          <FoldedNote className="-rotate-1 max-w-md self-start bg-[var(--note-ai)]" />
          <FoldedNote className="rotate-1 max-w-md self-end bg-[var(--note-user)]" />
        </div>
        <FoldedNote className="mt-auto min-h-[4.5rem] rotate-0" />
      </div>
    );
  }

  if (route === '/guestbook') {
    return (
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col">
        <ShimmerBar className="mx-auto h-9 w-40 bg-[var(--c-heading)]/15 md:h-11" />
        <FoldedNote className="mx-auto mt-6 w-full max-w-xl" />
        <div className="mt-8 columns-1 gap-4 sm:columns-2 lg:columns-3">
          <FoldedNote className="mb-4 -rotate-1 break-inside-avoid" />
          <FoldedNote className="mb-4 rotate-1 break-inside-avoid hidden sm:block" />
          <FoldedNote className="mb-4 -rotate-2 break-inside-avoid hidden lg:block" />
        </div>
      </div>
    );
  }

  if (route === '/stickers') {
    return (
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
        <ShimmerBar className="mx-auto h-9 w-56 bg-[var(--c-heading)]/15 md:h-12" />
        <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {Array.from({ length: 12 }, (_, index) => (
            <div
              key={index}
              className="aspect-square rounded-md border border-[var(--c-grid)]/35 bg-[var(--note-paper)] page-route-shimmer"
            />
          ))}
        </div>
      </div>
    );
  }

  if (route === '/settings') {
    return (
      <div className="relative mx-auto flex h-full w-full max-w-3xl flex-col gap-5">
        <Tape className="relative left-1/2 top-0 h-2 w-16 -translate-x-1/2 rotate-2" />
        <ShimmerBar className="mx-auto h-9 w-40 bg-[var(--c-heading)]/15" />
        <div className="rounded-md border border-dashed border-[var(--c-grid)] p-4">
          <ShimmerBar className="h-3 w-1/3 bg-[var(--c-ink)]/10" />
          <ShimmerBar className="mt-3 h-8 w-full bg-[var(--c-ink)]/8" />
        </div>
        <div className="rounded-md border border-dashed border-[var(--c-grid)] p-4">
          <ShimmerBar className="h-3 w-1/4 bg-[var(--c-ink)]/10" />
          <ShimmerBar className="mt-3 h-8 w-full bg-[var(--c-ink)]/8" />
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
  return (
    <div
      data-page-turn-skeleton
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="pointer-events-none absolute inset-0 z-20 px-3 py-6 sm:px-5 sm:py-8 md:p-12"
      style={{ contentVisibility: 'auto', contain: 'layout paint' }}
    >
      <span className="sr-only">{`Opening ${label}`}</span>
      <PageRouteSkeleton pathname={pathname} />
    </div>
  );
}
