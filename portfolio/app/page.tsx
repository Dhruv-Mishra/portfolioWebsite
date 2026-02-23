"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { HandDrawnArrow } from "@/components/SketchbookDoodles";
import { Coffee, MessageCircle } from "lucide-react";
import { APP_VERSION } from "@/lib/constants";

// Lazy load Terminal to reduce initial bundle size
const Terminal = dynamic(() => import("@/components/Terminal"), {
  loading: () => (
    <div className="h-[var(--c-terminal-h-md)] animate-pulse bg-gray-800/10 rounded-lg border-2 border-dashed border-gray-300" />
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

        {/* Hero title - CSS animation instead of framer-motion for faster LCP */}
        <h1
          className="animate-hero-title text-[length:var(--t-hero)] md:text-[length:var(--t-hero-md)] lg:text-[length:var(--t-hero-lg)] leading-none font-hand font-extrabold tracking-tighter text-indigo-900 p-4"
        >
          Hello World!
        </h1>

        {/* Version Sticker - CSS animation */}
        <div
          className="animate-hero-badge absolute -bottom-4 right-0 md:-right-12 bg-yellow-200 text-yellow-900 px-3 py-1 font-mono text-xs shadow-md"
        >
          {APP_VERSION}
        </div>
      </div>

      {/* Subtitle - CSS animation */}
      <p
        className="animate-hero-subtitle text-xl md:text-2xl text-gray-600 dark:text-gray-400 text-center max-w-lg font-hand leading-loose -rotate-1 mt-4"
      >
        I&apos;m <a href="https://www.linkedin.com/in/dhruv-mishra-id/" target="_blank" rel="noopener noreferrer" aria-label="Dhruv's LinkedIn Profile" className="font-bold text-indigo-700 dark:text-indigo-400 decoration-indigo-300 underline underline-offset-4 hover:decoration-indigo-500 hover:text-indigo-900 dark:hover:text-indigo-300 hover:scale-105 hover:-rotate-2 inline-block transition-[color,transform,text-decoration-color] duration-200">Dhruv</a>.
        I engineer <strong
          style={{ color: 'var(--c-highlight)' }}
          className="transition-none font-black"
        >
          high-performance systems
        </strong>, turning complex technical problems into elegant, reliable solutions.
      </p>

      {/* The Terminal */}
      <div className="w-full max-w-2xl mt-8 transform rotate-1 hover:rotate-0 transition-transform duration-300 z-20 relative">
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

      {/* Passed Note — Chat CTA */}
      <Link
        href="/chat"
        className="group mt-6 relative inline-block animate-hero-subtitle"
        aria-label="Chat with AI Dhruv"
      >
        {/* Folded note body */}
        <div className="relative bg-[#fff9c4] dark:bg-[#fef9c3]/90 px-5 py-3 shadow-md rotate-2 group-hover:rotate-0 transition-transform duration-300 border border-yellow-300/40">
          {/* Tape strip on top */}
          <div
            className="absolute -top-2 left-1/2 -translate-x-1/2 w-16 h-5 -rotate-1 z-10"
            style={{
              background: 'linear-gradient(135deg, rgba(200,200,180,0.5), rgba(220,220,200,0.35))',
              backdropFilter: 'blur(1px)',
              border: '1px solid rgba(180,180,160,0.2)',
            }}
          />
          {/* Ruled lines (decorative) */}
          <div className="absolute inset-x-4 top-[52%] h-px bg-blue-300/20 pointer-events-none" />
          <div className="absolute inset-x-4 top-[76%] h-px bg-blue-300/20 pointer-events-none" />
          {/* Content */}
          <div className="flex items-center gap-2.5">
            <MessageCircle className="w-5 h-5 text-indigo-500/70 group-hover:text-indigo-600 transition-colors shrink-0" strokeWidth={1.8} />
            <span className="font-hand text-base md:text-lg text-gray-700 dark:text-gray-800 group-hover:text-indigo-700 transition-colors">
              Pass me a note
            </span>
            <span className="text-indigo-400 group-hover:translate-x-1 transition-transform duration-200">→</span>
          </div>
          {/* Dog-ear fold */}
          <div
            className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none"
            style={{
              background: 'linear-gradient(135deg, #fff9c4 45%, #e5e1a8 50%, #d4d09a 100%)',
              clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
            }}
          />
        </div>
      </Link>
    </div>
  );
}
