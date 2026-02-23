"use client";

import { m } from 'framer-motion';
import { Home, FileQuestion } from 'lucide-react';
import { TAPE_STYLE_DECOR } from '@/lib/constants';
import { ANIMATION_TOKENS, INTERACTION_TOKENS } from '@/lib/designTokens';

// Hoisted animation objects — avoids re-allocation per render
const NOT_FOUND_INITIAL = { opacity: 0, scale: 0.95, rotate: -2 } as const;
const NOT_FOUND_ANIMATE = { opacity: 1, scale: 1, rotate: -2 } as const;
const NOT_FOUND_TRANSITION = { duration: ANIMATION_TOKENS.duration.slow, ease: ANIMATION_TOKENS.easing.smooth } as const;
const NOT_FOUND_HOVER = { ...INTERACTION_TOKENS.hover.card, transition: { duration: ANIMATION_TOKENS.duration.normal } } as const;
const SHAKE_ANIMATE = { rotate: [0, 5, -5, 0] };
const SHAKE_TRANSITION = { duration: 2, repeat: 1, ease: "easeInOut" as const };
const FADE_IN_INITIAL = { opacity: 0 } as const;
const FADE_IN_ANIMATE = { opacity: 1 } as const;
const FADE_IN_TRANSITION = { delay: 0.5 } as const;

export default function NotFound() {
  return (
    <div className="min-h-full flex items-center justify-center p-4">
      <m.div
        initial={NOT_FOUND_INITIAL}
        animate={NOT_FOUND_ANIMATE}
        transition={NOT_FOUND_TRANSITION}
        whileHover={NOT_FOUND_HOVER}
        className="max-w-2xl w-full bg-note-yellow p-8 md:p-12 rounded-lg shadow-2xl relative"
      >
        {/* Tape decoration */}
        <div className="absolute -top-4 left-1/4 w-24 h-8 shadow-sm transform -rotate-12" style={TAPE_STYLE_DECOR} />
        <div className="absolute -top-4 right-1/4 w-24 h-8 shadow-sm transform rotate-12" style={TAPE_STYLE_DECOR} />

        <div className="text-center relative z-10">
          <m.div
            animate={SHAKE_ANIMATE}
            transition={SHAKE_TRANSITION}
            className="inline-block mb-6"
          >
            <FileQuestion size={120} className="text-gray-400 mx-auto" strokeWidth={1.5} />
          </m.div>

          <h1 className="text-6xl md:text-8xl font-hand font-bold text-gray-900 mb-4">
            404
          </h1>

          <h2 className="text-3xl md:text-4xl font-hand font-bold text-gray-800 mb-6">
            Page Not Found
          </h2>

          <p className="text-xl md:text-2xl font-hand text-gray-700 mb-8 leading-relaxed">
            Oops! Looks like this page got lost in the sketchbook.
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <m.a
              href="/"
              whileHover={INTERACTION_TOKENS.hover.liftRotate}
              whileTap={INTERACTION_TOKENS.tap.press}
              className="flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-full font-hand font-bold text-xl shadow-lg hover:bg-indigo-700 transition-colors"
            >
              <Home size={24} />
              Go Home
            </m.a>

            <m.a
              href="/projects"
              whileHover={INTERACTION_TOKENS.hover.lift}
              whileTap={INTERACTION_TOKENS.tap.press}
              className="flex items-center gap-2 px-8 py-4 bg-white border-2 border-indigo-600 text-indigo-600 rounded-full font-hand font-bold text-xl shadow-lg hover:bg-indigo-50 transition-colors"
            >
              View Projects
            </m.a>
          </div>

          <m.div
            initial={FADE_IN_INITIAL}
            animate={FADE_IN_ANIMATE}
            transition={FADE_IN_TRANSITION}
            className="mt-8 text-gray-600 font-hand text-lg"
          >
            <p>Or try typing <span className="bg-gray-200 px-2 py-1 rounded font-code text-indigo-600">help</span> in the terminal on the home page</p>
          </m.div>
        </div>

        {/* Corner fold */}
        <div className="absolute bottom-0 right-0 w-16 h-16 overflow-hidden">
          <div className="absolute bottom-0 right-0 w-16 h-16 bg-gray-200 transform origin-bottom-right rotate-45 translate-x-8 translate-y-8" />
        </div>
      </m.div>
    </div>
  );
}
