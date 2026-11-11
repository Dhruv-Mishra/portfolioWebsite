"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { TAPE_STYLE_DECOR } from '@/lib/constants';
import { PROJECT_TOKENS } from '@/lib/designTokens';

const FOLD_SIZE = PROJECT_TOKENS.foldSize;
const CARD_CLIP_STYLE = {
  clipPath: `polygon(0% 0%, 100% 0%, 100% calc(100% - ${FOLD_SIZE}px), calc(100% - ${FOLD_SIZE}px) 100%, 0% 100%)`,
} as const;
const FOLD_SHADOW_STYLE = { width: FOLD_SIZE, height: FOLD_SIZE, background: 'var(--note-fold-shadow)' } as const;
const FOLD_FLAP_STYLE = {
  width: FOLD_SIZE,
  height: FOLD_SIZE,
  backgroundColor: 'var(--note-fold-underside)',
  clipPath: 'polygon(0 0, 0 100%, 100% 0)',
} as const;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-full flex items-center justify-center p-4">
      <div className="animate-page-sheet max-w-2xl w-full relative rotate-1 drop-shadow-xl">
        {/* Tape decoration */}
        <div data-tape-strip className="absolute -top-4 left-1/3 w-32 h-10 shadow-sm transform -rotate-6 z-20" style={TAPE_STYLE_DECOR} />

        {/* Dog-ear fold outside clipped sheet */}
        <div aria-hidden="true" className="absolute bottom-0 right-0 pointer-events-none z-10" style={FOLD_SHADOW_STYLE} />
        <div aria-hidden="true" className="absolute bottom-0 right-0 pointer-events-none z-10" style={FOLD_FLAP_STYLE} />

        <div
          className="bg-note-yellow border border-[var(--c-ink)]/15 p-8 md:p-12 text-center relative z-0"
          style={CARD_CLIP_STYLE}
        >
          <div className="inline-block mb-5">
            <AlertTriangle size={88} className="text-amber-600 dark:text-amber-400 mx-auto" strokeWidth={2} aria-hidden="true" />
          </div>

          <h1 className="text-5xl md:text-7xl font-hand font-bold text-[var(--c-heading)] mb-3">
            Page Hit a Snag
          </h1>

          <h2 className="text-2xl md:text-3xl font-hand font-bold text-[var(--c-ink)] mb-5">
            This view failed to render
          </h2>

          <p className="text-lg md:text-xl font-hand text-[var(--c-ink)]/80 mb-8 leading-relaxed max-w-lg mx-auto">
            Reloading the view usually clears transient state. If it keeps happening, return home while the error log is reviewed.
          </p>

          {process.env.NODE_ENV === 'development' && (
            <div className="mb-8 p-4 bg-gray-900 rounded-lg text-left overflow-auto max-h-40">
              <pre className="text-xs text-gray-100 font-code">
                {error.message}
              </pre>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              type="button"
              onClick={reset}
              className="flex min-h-11 items-center gap-2 px-8 py-3.5 bg-indigo-600 text-white rounded-full font-hand font-bold text-xl shadow-md hover:bg-indigo-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              <RefreshCw size={22} aria-hidden="true" />
              Reload View
            </button>

            <button
              type="button"
              onClick={() => router.push('/')}
              className="flex min-h-11 items-center gap-2 px-8 py-3.5 bg-[var(--c-paper)] border-2 border-indigo-500 text-indigo-700 dark:text-indigo-300 rounded-full font-hand font-bold text-xl shadow-md hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              Back to Home
            </button>
          </div>

          {error.digest ? (
            <p className="mt-8 text-[var(--c-ink)]/55 font-code text-xs">
              Error digest: {error.digest}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
