/** Decorative route-transition spinner; Next's route announcer reports the page change to assistive tech. */
export function RouteLoadingIndicator() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-6 p-8" aria-hidden="true">
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-gray-300 border-t-indigo-600 motion-reduce:animate-none" />
      <p className="font-hand text-xl text-gray-600 animate-pulse motion-reduce:animate-none dark:text-gray-400">
        Loading...
      </p>
    </div>
  );
}
