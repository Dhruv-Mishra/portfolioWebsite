"use client";

import Link from 'next/link';
import { Home, FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-full flex items-center justify-center p-4">
      {/* CSS animation instead of framer-motion */}
      <div
        className="max-w-2xl w-full bg-note-yellow p-8 md:p-12 rounded-lg shadow-2xl relative animate-page-card-in note-tilt"
        style={{ ['--note-rotate' as string]: '-2deg' }}
      >
        {/* Tape decoration */}
        <div className="absolute -top-4 left-1/4 w-24 h-8 bg-white/80 backdrop-blur-sm shadow-sm transform -rotate-12" />
        <div className="absolute -top-4 right-1/4 w-24 h-8 bg-white/80 backdrop-blur-sm shadow-sm transform rotate-12" />

        <div className="text-center relative z-10">
          {/* CSS animation for the icon */}
          <div className="inline-block mb-6 animate-wiggle">
            <FileQuestion size={120} className="text-gray-400 mx-auto" strokeWidth={1.5} />
          </div>

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
            <Link href="/">
              <button
                className="flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-full font-hand font-bold text-xl shadow-lg hover:bg-indigo-700 hover:scale-105 hover:rotate-2 active:scale-95 transition-all"
              >
                <Home size={24} />
                Go Home
              </button>
            </Link>

            <Link href="/projects">
              <button
                className="flex items-center gap-2 px-8 py-4 bg-white border-2 border-indigo-600 text-indigo-600 rounded-full font-hand font-bold text-xl shadow-lg hover:bg-indigo-50 hover:scale-105 hover:-rotate-2 active:scale-95 transition-all"
              >
                View Projects
              </button>
            </Link>
          </div>

          <div className="mt-8 text-gray-600 font-hand text-lg animate-fade-in" style={{ animationDelay: '0.5s' }}>
            <p>Or try typing <span className="bg-gray-200 px-2 py-1 rounded font-code text-indigo-600">help</span> in the terminal on the home page</p>
          </div>
        </div>

        {/* Corner fold */}
        <div className="absolute bottom-0 right-0 w-16 h-16 overflow-hidden">
          <div className="absolute bottom-0 right-0 w-16 h-16 bg-gray-200 transform origin-bottom-right rotate-45 translate-x-8 translate-y-8" />
        </div>
      </div>
    </div>
  );
}
