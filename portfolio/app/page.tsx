import type { CSSProperties } from "react";
import Link from "next/link";
import HomeTerminalIsland from "@/components/HomeTerminalIsland";
import { RoutePendingMarker } from "@/components/Navigation";
import HomeVoiceNote from "@/components/voice/HomeVoiceNote";
import { HandDrawnArrow } from "@/components/SketchbookDoodles";
import { Coffee, MessageCircle, PenLine, type LucideIcon } from "lucide-react";
import { SITE_VERSION_LABEL } from "@/lib/siteVersion";
import { PERSONAL_LINKS } from "@/lib/links";
import { PAPER_PALETTE } from "@/lib/designTokens";

const QUICK_LINK_CLASS = "inline-flex min-h-11 items-center px-1.5 text-indigo-700 underline decoration-wavy decoration-indigo-300 underline-offset-4 transition-colors hover:text-indigo-900 hover:decoration-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200";
const TAPE_CLASS = "absolute -top-2 left-1/2 -translate-x-1/2 w-16 h-5 -rotate-1 z-10 bg-[linear-gradient(135deg,rgba(200,200,180,0.72),rgba(220,220,200,0.56))] border border-[rgba(180,180,160,0.2)] md:bg-[linear-gradient(135deg,rgba(200,200,180,0.5),rgba(220,220,200,0.35))] md:backdrop-blur-[1px]";

interface NoteCtaProps {
  href: string;
  srHint: string;
  label: string;
  trailingGlyph?: string;
  icon: LucideIcon;
  delayMs: number;
  tiltClassName?: string;
  className?: string;
  /** Static Tailwind classes per part, kept literal so Tailwind can scan them. */
  tone: { body: string; rule: string; icon: string; text: string; arrow: string };
  fold: string;
}

function NoteCta({
  href,
  srHint,
  label,
  trailingGlyph,
  icon: Icon,
  delayMs,
  tiltClassName = 'rotate-2',
  className = '',
  tone,
  fold,
}: NoteCtaProps) {
  return (
    <Link
      href={href}
      prefetch={false}
      data-hover-tilt
      data-disco-motion="wiggle"
      style={{ '--disco-motion-delay': `${delayMs}ms` } as CSSProperties}
      className={`group relative inline-block animate-hero-subtitle ${className}`}
    >
      <div className={`relative px-5 py-3 shadow-sm md:shadow-md ${tiltClassName} md:group-hover:rotate-0 transition-transform duration-300 border ${tone.body}`}>
        <div data-tape-strip className={TAPE_CLASS} />
        <div className={`absolute inset-x-4 top-[52%] h-px pointer-events-none ${tone.rule}`} />
        <div className={`absolute inset-x-4 top-[76%] h-px pointer-events-none ${tone.rule}`} />
        <div className="flex items-center gap-2.5">
          <Icon size={20} aria-hidden="true" className={`transition-colors shrink-0 ${tone.icon}`} strokeWidth={1.8} />
          <span className={`font-hand text-base md:text-lg transition-colors ${tone.text}`}>
            {label}
            {trailingGlyph ? <span aria-hidden="true"> {trailingGlyph}</span> : null}
          </span>
          <span className="sr-only"> — {srHint}</span>
          <span aria-hidden="true" className={`md:group-hover:translate-x-1 transition-transform duration-200 ${tone.arrow}`}>→</span>
        </div>
        {/* Dog-ear fold */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none"
          style={{ background: fold, clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
        />
      </div>
      <RoutePendingMarker />
    </Link>
  );
}

export default function Home() {

  return (
    <div
      className="flex flex-col gap-4 md:gap-5 min-h-full relative items-center py-2"
      style={{ justifyContent: 'safe center' } as CSSProperties}
    >
      {/* Decor Elements */}


      <div className="relative">
        {/* Coffee Cup - Positioned relative to text */}
        <div
          data-disco-motion="bob"
          style={{ '--disco-motion-delay': '60ms' } as CSSProperties}
          className="absolute -top-7 -right-7 md:-top-11 md:-right-10 opacity-90 rotate-12 pointer-events-none z-10"
          aria-hidden="true"
        >
          <Coffee className="text-amber-800/45 dark:text-amber-200/45 w-11 h-11 md:w-20 md:h-20" />
        </div>

        {/* Hero title - CSS animation instead of framer-motion for faster LCP */}
        <h1
          data-disco-motion="wiggle"
          className="animate-hero-title text-[length:var(--t-hero)] md:text-[length:var(--t-hero-md)] lg:text-[length:var(--t-hero-lg)] leading-none font-hand font-extrabold tracking-tighter text-indigo-950 dark:text-indigo-100 p-3 md:p-4 max-[360px]:text-5xl"
        >
          Hello World!
        </h1>

        {/* Version Sticker - CSS animation */}
        <div className="animate-hero-badge absolute -bottom-2.5 right-2 md:right-0 md:-right-8">
          <span
            data-disco-motion="bob"
            style={{ '--disco-motion-delay': '180ms' } as CSSProperties}
            className="inline-block bg-yellow-100/75 text-yellow-900/80 dark:bg-amber-950/65 dark:text-amber-200/80 border border-yellow-300/40 dark:border-amber-700/40 px-2 py-0.5 font-code text-[11px] tracking-tight shadow-sm"
          >
            {SITE_VERSION_LABEL}
          </span>
        </div>
      </div>

      {/* Subtitle - CSS animation */}
      <p
        data-disco-motion="shimmy"
        style={{ '--disco-motion-delay': '90ms' } as CSSProperties}
        className="animate-hero-subtitle text-xl md:text-2xl text-gray-600 dark:text-gray-300 text-center max-w-lg font-hand leading-relaxed md:leading-loose -rotate-1 mt-1"
      >
        I&apos;m <a href="https://www.linkedin.com/in/dhruv-mishra-id/" target="_blank" rel="noopener noreferrer" aria-label="Dhruv Mishra — LinkedIn profile" className="font-bold text-indigo-700 dark:text-indigo-300 decoration-indigo-300 dark:decoration-indigo-500/70 underline underline-offset-4 hover:decoration-indigo-500 hover:text-indigo-900 dark:hover:text-indigo-200 hover:scale-105 hover:-rotate-2 inline-block transition-[color,transform,text-decoration-color] duration-200">Dhruv Mishra</a>,
        a software engineer at Microsoft. I build <strong
          style={{ color: 'var(--c-highlight)' }}
          className="transition-none font-black"
        >
          AI agents
        </strong> and the Azure backend services they run on.
      </p>

      <nav
        aria-label="Quick links"
        className="animate-hero-subtitle -mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-hand text-lg text-gray-500 dark:text-gray-400"
      >
        <Link href="/resume" prefetch={false} className={QUICK_LINK_CLASS}>resume<RoutePendingMarker /></Link>
        <span aria-hidden="true">·</span>
        <Link href="/projects" prefetch={false} className={QUICK_LINK_CLASS}>projects<RoutePendingMarker /></Link>
        <span aria-hidden="true">·</span>
        <a href={PERSONAL_LINKS.email} className={QUICK_LINK_CLASS}>email me</a>
      </nav>

      <HomeVoiceNote context={{ source: 'home', topic: 'home' }} className="mt-1" />

      {/* The Terminal */}
      <div
        data-disco-home-terminal
        data-hover-tilt
        data-tilt-3d="paper"
        data-disco-motion="breath"
        style={{
          '--disco-motion-delay': '180ms',
          '--hover-tilt-lift': '-2px',
          '--hover-tilt-scale': '1.005',
        } as CSSProperties}
        className="w-full max-w-2xl mt-3 md:mt-4 transform md:rotate-1 md:hover:rotate-0 transition-transform duration-300 z-20 relative"
      >
        <HomeTerminalIsland />

        {/* Interaction Hint (Desktop Only) */}
        <div
          data-disco-motion="wiggle"
          style={{ '--disco-motion-delay': '360ms' } as CSSProperties}
          className="hidden xl:block absolute -left-56 2xl:-left-68 top-20 w-52 2xl:w-60 -rotate-6 opacity-90 pointer-events-none"
          aria-hidden="true"
        >
          <div className="font-hand text-3xl 2xl:text-4xl text-[var(--d-blue)] mb-2 text-center font-bold tracking-wide">
            Psst... type something!
          </div>
          <HandDrawnArrow className="w-32 2xl:w-40 h-20 2xl:h-24 text-[var(--d-blue)] transform rotate-12 ml-auto -mt-4 mr-4" />
        </div>
      </div>

      <div
        data-disco-motion="bob"
        style={{ '--disco-motion-delay': '300ms' } as CSSProperties}
        className="mt-2 text-sm font-code text-gray-500 dark:text-gray-400"
      >
        Try typing <kbd className="rounded border border-indigo-200/80 bg-indigo-50/90 px-1.5 py-0.5 font-code text-xs font-semibold text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-950/60 dark:text-indigo-300">projects</kbd> to view my work...
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-4 sm:gap-7">
        <NoteCta
          href="/chat"
          srHint="chat with AI Dhruv"
          label="Pass me a note"
          icon={MessageCircle}
          delayMs={420}
          tiltClassName="-rotate-2"
          tone={{
            body: "bg-paper-yellow dark:bg-[#fef9c3]/90 border-yellow-300/50 dark:border-yellow-400/35",
            rule: "bg-blue-300/20",
            icon: "text-indigo-500/75 md:group-hover:text-indigo-600",
            text: "text-gray-700 dark:text-gray-800 md:group-hover:text-indigo-700",
            arrow: "text-indigo-400",
          }}
          fold={`linear-gradient(135deg, ${PAPER_PALETTE.yellow} 45%, #e5e1a8 50%, #d4d09a 100%)`}
        />
        <NoteCta
          href="/guestbook"
          srHint="open guestbook"
          label="Sign my sketchbook"
          trailingGlyph="✎"
          icon={PenLine}
          delayMs={560}
          tiltClassName="rotate-2"
          tone={{
            body: "bg-paper-coral dark:bg-paper-coral-dark border-orange-300/50 dark:border-orange-400/30",
            rule: "bg-rose-300/25",
            icon: "text-rose-500/75 dark:text-rose-300/80 md:group-hover:text-rose-600 dark:md:group-hover:text-rose-200",
            text: "text-gray-700 dark:text-gray-100 md:group-hover:text-rose-700 dark:md:group-hover:text-rose-200",
            arrow: "text-rose-400 dark:text-rose-300",
          }}
          fold={`linear-gradient(135deg, ${PAPER_PALETTE.coral} 45%, #e6a895 50%, #cc8a77 100%)`}
        />
      </div>
    </div>
  );
}
