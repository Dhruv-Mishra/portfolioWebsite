"use client";
import Terminal from "@/components/Terminal";
import { motion } from "framer-motion";
import { Coffee } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col gap-6 h-full relative justify-center items-center">
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
          className="text-6xl md:text-8xl lg:text-9xl font-hand font-extrabold tracking-tighter text-indigo-900 drop-shadow-sm p-4"
        >
          Hello World!
        </motion.h1>

        {/* Version Sticker */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="absolute -bottom-4 -right-12 rotate-12 bg-yellow-200 text-yellow-900 px-3 py-1 font-mono text-xs shadow-md transform"
        >
          v1.0.0-beta
        </motion.div>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-xl md:text-2xl text-gray-600 text-center max-w-lg font-hand leading-loose -rotate-1 mt-4"
      >
        I&apos;m <span className="font-bold text-indigo-700 decoration-indigo-300 underline underline-offset-4">Dhruv</span>.
        This is where my messy code meets my structured creativity.
      </motion.p>

      {/* The Terminal */}
      <div className="w-full max-w-2xl mt-8 transform rotate-1 hover:rotate-0 transition-all duration-300 z-20">
        <Terminal />
      </div>

      <div className="mt-8 text-sm font-mono text-gray-400">
        Try typing <span className="text-indigo-500 bg-gray-100 px-1 rounded">help</span> below...
      </div>
    </div>
  );
}
