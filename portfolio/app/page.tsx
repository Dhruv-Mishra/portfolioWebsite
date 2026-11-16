import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { MessageCircle, PenLine, type LucideIcon } from "lucide-react";
import FeaturedProjects from "@/components/home/FeaturedProjects";
import { NoteFace, type NoteTone } from "@/components/home/NoteFace";
import HomeTerminalIsland from "@/components/HomeTerminalIsland";
import { RoutePendingMarker } from "@/components/Navigation";
import HomeVoiceNote from "@/components/voice/HomeVoiceNote";
import { ABOUT_PHOTO } from "@/lib/assets";
import "@/components/home/home.css";

const TEXT_LINK_CLASS = "inline-flex min-h-11 items-center font-hand text-xl text-indigo-700 underline decoration-wavy decoration-indigo-300 underline-offset-4 transition-colors duration-[var(--dur-micro)] hover:text-indigo-900 hover:decoration-indigo-500 focus-ring dark:text-indigo-300 dark:decoration-indigo-500/60 dark:hover:text-indigo-200";
const TERMINAL_TILT_STYLE = { '--hover-tilt-lift': '-2px', '--hover-tilt-scale': '1.005' } as CSSProperties;

function NoteLink({ href, label, icon, tone, tilt }: { href: string; label: string; icon: LucideIcon; tone: NoteTone; tilt: string }) {
  return (
    <Link href={href} prefetch={false} data-hover-tilt data-disco-motion="wiggle" className="group relative inline-block focus-ring">
      <NoteFace icon={icon} label={label} tone={tone} className={tilt} />
      <RoutePendingMarker />
    </Link>
  );
}

export default function Home() {
  return (
    <div className="home-grid mx-auto grid w-full max-w-[70rem] grid-cols-1 gap-y-16 px-2 pb-4 pt-4 sm:px-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-x-16 lg:gap-y-16 lg:px-0 lg:pt-8">
      <section aria-label="Introduction" className="order-1 flex flex-col items-center gap-7 text-center lg:order-none lg:col-start-1 lg:row-start-1 lg:items-start lg:gap-6 lg:self-center lg:text-left">
        <div className="relative isolate">
          <h1
            data-disco-motion="wiggle"
            className="animate-hero-title font-hand ink-heavy text-[length:var(--t-hero)] leading-[var(--lh-display)] tracking-tight text-indigo-950 md:text-[length:var(--t-hero-md)] lg:text-[length:var(--t-hero-lg)] dark:text-indigo-100"
          >
            Hello World!
          </h1>
          <svg aria-hidden="true" viewBox="0 0 300 24" preserveAspectRatio="none" className="hero-swash absolute -bottom-1 left-[14%] -z-10 h-[0.3em] w-[72%] -rotate-3 text-[length:var(--t-hero)] md:text-[length:var(--t-hero-md)] lg:left-1 lg:text-[length:var(--t-hero-lg)]">
            <path d="M6 16 C 70 8, 150 6, 294 11" pathLength={1} fill="none" strokeWidth="12" strokeLinecap="round" />
          </svg>
        </div>

        <p className="max-w-[var(--measure-lead)] font-body text-[length:var(--t-lead)] leading-[var(--lh-lead)] text-[var(--c-ink)] md:text-[length:var(--t-lead-md)]">
          I&apos;m Dhruv Mishra, a software engineer at Microsoft. I build AI agents and the Azure backend services they run on.
        </p>

        <div className="flex flex-col items-center gap-2 lg:items-start">
          <HomeVoiceNote context={{ source: 'home', topic: 'home' }} />
          <p className="font-hand text-[length:var(--t-hand-sm)] text-[var(--c-ink-muted)]">A voice agent that knows my work. Uses your mic.</p>
        </div>

        <nav aria-label="Quick links" className="flex flex-wrap justify-center gap-x-5 gap-y-4 pt-1 lg:justify-start">
          <NoteLink href="/chat" label="Chat" icon={MessageCircle} tone="yellow" tilt="-rotate-2" />
          <NoteLink href="/guestbook" label="Sign my sketchbook" icon={PenLine} tone="coral" tilt="rotate-2" />
        </nav>
      </section>

      <div className="order-3 lg:order-none lg:col-start-2 lg:row-start-1 lg:self-center">
        <div
          data-disco-home-terminal
          data-hover-tilt
          data-tilt-3d="paper"
          data-disco-motion="breath"
          style={TERMINAL_TILT_STYLE}
          className="relative z-20 transition-transform duration-300 md:rotate-1 md:hover:rotate-0"
        >
          <HomeTerminalIsland />
        </div>
      </div>

      <FeaturedProjects className="order-2 lg:order-none lg:col-start-2 lg:row-start-2" />

      <section aria-labelledby="about-mini-heading" className="order-4 lg:order-none lg:col-start-1 lg:row-start-2">
        <h2 id="about-mini-heading" className="mb-5 text-center font-hand ink-heavy text-[length:var(--t-h2)] leading-[var(--lh-snug)] text-[var(--c-heading)] md:text-[length:var(--t-h2-md)] lg:mb-4 lg:text-left">
          About me
        </h2>
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-start sm:gap-5 sm:text-left">
          <div data-hover-tilt className="-rotate-3 shrink-0 bg-[var(--c-polaroid)] p-1.5 pb-5 shadow-polaroid">
            <Image
              src={ABOUT_PHOTO.src}
              alt={ABOUT_PHOTO.alt}
              width={128}
              height={128}
              loading="lazy"
              placeholder="blur"
              blurDataURL={ABOUT_PHOTO.blurDataURL}
              className="size-28 object-cover sepia-[.2] md:size-32"
            />
          </div>
          <div className="min-w-0">
            <p className="max-w-[36ch] font-body text-[length:var(--t-body-md)] leading-[var(--lh-body)] text-[var(--c-ink)]">
              Software engineer at Microsoft since 2024, IIIT Delhi Honors grad and Codeforces Expert. Off the clock: lifting, chess and overclocking.
            </p>
            <Link href="/about" prefetch={false} className={TEXT_LINK_CLASS}>More about me<RoutePendingMarker /></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
