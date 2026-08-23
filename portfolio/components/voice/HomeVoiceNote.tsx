"use client";

import type { CSSProperties } from 'react';
import { AudioLines } from 'lucide-react';
import { requestVoiceMode } from '@/lib/voiceModeStore';

export default function HomeVoiceNote() {
  return (
    <button
      type="button"
      data-disco-motion="wiggle"
      style={{ '--disco-motion-delay': '490ms' } as CSSProperties}
      className="group mt-4 relative inline-block animate-hero-subtitle"
      aria-label="Talk with Dhruv by voice"
      onClick={requestVoiceMode}
    >
      <div className="relative bg-[#dbeafe] dark:bg-[#1e3a5f] px-5 py-3 shadow-sm md:shadow-md -rotate-1 md:group-hover:rotate-0 transition-transform duration-300 border border-indigo-300/40 dark:border-indigo-400/25">
        <div
          className="absolute -top-2 left-1/2 -translate-x-1/2 w-16 h-5 rotate-1 z-10 bg-[linear-gradient(135deg,rgba(200,200,180,0.72),rgba(220,220,200,0.56))] border border-[rgba(180,180,160,0.2)] md:bg-[linear-gradient(135deg,rgba(200,200,180,0.5),rgba(220,220,200,0.35))] md:backdrop-blur-[1px]"
        />
        <div className="absolute inset-x-4 top-[52%] h-px bg-indigo-400/20 pointer-events-none" />
        <div className="absolute inset-x-4 top-[76%] h-px bg-indigo-400/20 pointer-events-none" />
        <div className="flex items-center gap-2.5">
          <AudioLines className="w-5 h-5 text-indigo-600/80 dark:text-indigo-200/80 md:group-hover:text-indigo-700 dark:md:group-hover:text-indigo-100 transition-colors shrink-0" strokeWidth={1.8} />
          <span className="font-hand text-base md:text-lg text-indigo-950 dark:text-indigo-50 md:group-hover:text-indigo-800 dark:md:group-hover:text-white transition-colors">
            Talk to me
          </span>
          <span className="text-indigo-500 dark:text-indigo-300 md:group-hover:translate-x-1 transition-transform duration-200">→</span>
        </div>
        <div
          className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none bg-[linear-gradient(135deg,#dbeafe_45%,#bfdbfe_50%,#93c5fd_100%)] dark:bg-[linear-gradient(135deg,#1e3a5f_45%,#1e40af_50%,#172554_100%)]"
          style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
        />
      </div>
    </button>
  );
}
