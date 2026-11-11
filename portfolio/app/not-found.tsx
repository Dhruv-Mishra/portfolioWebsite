import Link from 'next/link';
import { Home, FileQuestion } from 'lucide-react';
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

export default function NotFound() {
  return (
    <div className="min-h-full flex items-center justify-center p-4">
      <div className="animate-page-sheet max-w-2xl w-full relative -rotate-2 drop-shadow-xl">
        {/* Tape decoration */}
        <div data-tape-strip className="absolute -top-4 left-1/4 w-24 h-8 shadow-sm transform -rotate-12 z-20" style={TAPE_STYLE_DECOR} />
        <div data-tape-strip className="absolute -top-4 right-1/4 w-24 h-8 shadow-sm transform rotate-12 z-20" style={TAPE_STYLE_DECOR} />

        {/* Dog-ear fold outside clipped sheet */}
        <div aria-hidden="true" className="absolute bottom-0 right-0 pointer-events-none z-10" style={FOLD_SHADOW_STYLE} />
        <div aria-hidden="true" className="absolute bottom-0 right-0 pointer-events-none z-10" style={FOLD_FLAP_STYLE} />

        <div
          className="bg-note-yellow border border-[var(--c-ink)]/15 p-8 md:p-12 text-center relative z-0"
          style={CARD_CLIP_STYLE}
        >
          <div className="inline-block mb-5">
            <FileQuestion size={96} className="text-[var(--c-ink)]/40 mx-auto" strokeWidth={1.5} aria-hidden="true" />
          </div>

          <h1 className="text-6xl md:text-8xl font-hand font-bold text-[var(--c-heading)] mb-3">
            404
          </h1>

          <h2 className="text-3xl md:text-4xl font-hand font-bold text-[var(--c-ink)] mb-5">
            Missing Page
          </h2>

          <p className="text-xl md:text-2xl font-hand text-[var(--c-ink)]/80 mb-8 leading-relaxed max-w-lg mx-auto">
            This sheet isn&apos;t in the sketchbook — the link may have moved or never existed.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/"
              className="flex min-h-11 items-center gap-2 px-8 py-3.5 bg-indigo-600 text-white rounded-full font-hand font-bold text-xl shadow-md hover:bg-indigo-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              <Home size={22} aria-hidden="true" />
              Back to Home
            </Link>

            <Link
              href="/projects"
              className="flex min-h-11 items-center gap-2 px-8 py-3.5 bg-[var(--c-paper)] border-2 border-indigo-500 text-indigo-700 dark:text-indigo-300 rounded-full font-hand font-bold text-xl shadow-md hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              Browse Projects
            </Link>
          </div>

          <p className="mt-8 text-[var(--c-ink)]/65 font-hand text-lg">
            Or run <kbd className="rounded border border-indigo-200/80 bg-indigo-50/90 px-2 py-0.5 font-code text-sm font-semibold text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-950/60 dark:text-indigo-300">help</kbd> in the home terminal.
          </p>
        </div>
      </div>
    </div>
  );
}
