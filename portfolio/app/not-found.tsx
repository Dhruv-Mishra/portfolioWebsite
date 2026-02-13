"use client";

import { m } from 'framer-motion';
import Link from 'next/link';
import { Home, FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-full flex items-center justify-center p-4">
      <m.div
        initial={{ opacity: 0, scale: 0.95, rotate: -2 }}
        whileInView={{ opacity: 1, scale: 1, rotate: -2 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        whileHover={{
          scale: 1.02,
          rotate: 0,
          transition: { duration: 0.2 }
        }}
        className="max-w-2xl w-full bg-note-yellow p-8 md:p-12 rounded-lg shadow-2xl relative"
      >
        {/* Tape decoration */}
        <div className="absolute -top-4 left-1/4 w-24 h-8 shadow-sm transform -rotate-12" style={{ backgroundColor: 'var(--tape-color, rgba(194, 163, 120, 0.6))', clipPath: 'polygon(5% 0%, 95% 0%, 100% 5%, 98% 10%, 100% 15%, 98% 20%, 100% 25%, 98% 30%, 100% 35%, 98% 40%, 100% 45%, 98% 50%, 100% 55%, 98% 60%, 100% 65%, 98% 70%, 100% 75%, 98% 80%, 100% 85%, 98% 90%, 100% 95%, 95% 100%, 5% 100%, 0% 95%, 2% 90%, 0% 85%, 2% 80%, 0% 75%, 2% 70%, 0% 65%, 2% 60%, 0% 55%, 2% 50%, 0% 45%, 2% 40%, 0% 35%, 2% 30%, 0% 25%, 2% 20%, 0% 15%, 2% 10%, 0% 5%)' }} />
        <div className="absolute -top-4 right-1/4 w-24 h-8 shadow-sm transform rotate-12" style={{ backgroundColor: 'var(--tape-color, rgba(194, 163, 120, 0.6))', clipPath: 'polygon(5% 0%, 95% 0%, 100% 5%, 98% 10%, 100% 15%, 98% 20%, 100% 25%, 98% 30%, 100% 35%, 98% 40%, 100% 45%, 98% 50%, 100% 55%, 98% 60%, 100% 65%, 98% 70%, 100% 75%, 98% 80%, 100% 85%, 98% 90%, 100% 95%, 95% 100%, 5% 100%, 0% 95%, 2% 90%, 0% 85%, 2% 80%, 0% 75%, 2% 70%, 0% 65%, 2% 60%, 0% 55%, 2% 50%, 0% 45%, 2% 40%, 0% 35%, 2% 30%, 0% 25%, 2% 20%, 0% 15%, 2% 10%, 0% 5%)' }} />

        <div className="text-center relative z-10">
          <m.div
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 2, repeat: 3, ease: "easeInOut" }}
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
            <Link href="/">
              <m.button
                type="button"
                whileHover={{ scale: 1.05, rotate: 2 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-full font-hand font-bold text-xl shadow-lg hover:bg-indigo-700 transition-colors"
              >
                <Home size={24} />
                Go Home
              </m.button>
            </Link>

            <Link href="/projects">
              <m.button
                type="button"
                whileHover={{ scale: 1.05, rotate: -2 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-8 py-4 bg-white border-2 border-indigo-600 text-indigo-600 rounded-full font-hand font-bold text-xl shadow-lg hover:bg-indigo-50 transition-colors"
              >
                View Projects
              </m.button>
            </Link>
          </div>

          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
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
