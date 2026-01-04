"use client";
import dynamic from "next/dynamic";
import { HandDrawnArrow } from "@/components/SketchbookDoodles";
import { motion } from "framer-motion";
import { Coffee } from "lucide-react";

// Lazy load Terminal to reduce initial bundle size
const Terminal = dynamic(() => import("@/components/Terminal"), {
  loading: () => (
    <div className="h-[400px] animate-pulse bg-gray-800/10 rounded-lg border-2 border-dashed border-gray-300" />
  ),
  ssr: false,
});

export default function Home() {

  return (
    <div className="flex flex-col gap-6 min-h-full relative justify-center items-center py-20 pb-24 md:py-0 md:pb-0">
      {/* Decor Elements */}


      <div className="relative">
        {/* Coffee Cup - Positioned relative to text */}
        <div className="absolute -top-8 -right-8 md:-top-12 md:-right-10 opacity-90 rotate-12 pointer-events-none z-10">
          <Coffee className="text-amber-800/40 w-12 h-12 md:w-20 md:h-20" />
        </div>

        <motion.h1
          initial={{ opacity: 0, scale: 0.9, rotate: -4 }}
          animate={{ opacity: 1, scale: 1, rotate: -4 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-4xl md:text-8xl lg:text-9xl font-hand font-extrabold tracking-tighter text-indigo-900 drop-shadow-sm p-4"
        >
          Hello World!
        </motion.h1>

        {/* Version Sticker */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="absolute -bottom-4 right-0 md:-right-12 rotate-12 bg-yellow-200 text-yellow-900 px-3 py-1 font-mono text-xs shadow-md transform"
        >
          v0.0.2-beta
        </motion.div>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-xl md:text-2xl text-gray-600 dark:text-gray-400 text-center max-w-lg font-hand leading-loose -rotate-1 mt-4"
      >
        I&apos;m <a href="https://www.linkedin.com/in/dhruv-mishra-id/" target="_blank" rel="noreferrer" className="font-bold text-indigo-700 dark:text-indigo-400 decoration-indigo-300 underline underline-offset-4 hover:decoration-indigo-500 transition-all">Dhruv</a>.
        I engineer <strong
          style={{ color: 'var(--c-highlight)' }}
          className="transition-none font-black"
        >
          high-performance systems
        </strong>, turning complex technical problems into elegant, reliable solutions.
      </motion.p>

      {/* The Terminal */}
      <div className="w-full max-w-2xl mt-8 transform rotate-1 hover:rotate-0 transition-all duration-300 z-20 relative">
        <Terminal />

        {/* Interaction Hint (Desktop Only) */}
        <div className="hidden xl:block absolute -left-72 top-20 w-64 -rotate-6 opacity-90 pointer-events-none">
          <div className="font-hand text-4xl text-[var(--d-blue)] mb-2 text-center font-bold tracking-wide">
            Psst... type something!
          </div>
          <HandDrawnArrow className="w-40 h-24 text-[var(--d-blue)] transform rotate-12 ml-auto -mt-4 mr-4" />
        </div>
      </div>

      <div className="mt-8 text-sm font-mono text-gray-400">
        Try typing <span className="text-indigo-500 bg-gray-100 px-1 rounded">projects</span> to view my work...
      </div>
    </div>
  );
}
