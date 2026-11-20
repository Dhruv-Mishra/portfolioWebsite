"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import dynamic from "next/dynamic";
import { TerminalProvider } from "@/context/TerminalContext";
import { SKETCH_RADIUS, TERMINAL_COLORS } from "@/lib/designTokens";

const SHELL_STYLE = { borderRadius: SKETCH_RADIUS.terminal, backgroundColor: TERMINAL_COLORS.bg } as const;
const HEADER_STYLE = { backgroundColor: TERMINAL_COLORS.headerBg } as const;
// The route scrolls inside its own container, so proximity is measured against it, with a short lead.
const NEAR_VIEWPORT_MARGIN = "25% 0px";
// Mounted after the load window even if never scrolled to, so voice commands still find a terminal.
const IDLE_MOUNT_DELAY_MS = 4_000;

// Same footprint as the real terminal, so the client-only swap neither flashes nor shifts layout.
function TerminalPlaceholder({ ref }: { ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} aria-hidden="true" className={`mx-auto w-full max-w-[var(--c-terminal-max-w)] overflow-hidden border-[3px] ${TERMINAL_COLORS.border}`} style={SHELL_STYLE}>
      <div className={`h-[3.25rem] border-b-2 md:h-[3.5rem] ${TERMINAL_COLORS.headerBorder}`} style={HEADER_STYLE} />
      <div className="h-[var(--c-terminal-h)] md:h-[var(--c-terminal-h-md)]" />
    </div>
  );
}

const Terminal = dynamic(() => import("@/components/Terminal"), {
  loading: () => <TerminalPlaceholder />,
  ssr: false,
});

/** Phones show the terminal below the fold, so its code loads as it nears the viewport instead of with the page. */
function useNearViewport(): [Ref<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const slot = ref.current;
    if (near || !slot) return;
    const show = () => setNear(true);
    const scroller = slot.closest<HTMLElement>("[data-route-scroll-container]");
    const observer = new IntersectionObserver(
      (entries) => { if (entries.some((entry) => entry.isIntersecting)) show(); },
      { root: scroller, rootMargin: NEAR_VIEWPORT_MARGIN },
    );
    observer.observe(slot);
    // Scrolling at all is intent: start loading so the terminal is ready by the time it scrolls into view.
    const scrollTarget: HTMLElement | Window = scroller ?? window;
    scrollTarget.addEventListener("scroll", show, { once: true, passive: true });

    let idleTimer: number | undefined;
    const showWhenIdle = () => {
      idleTimer = window.setTimeout(() => window.requestIdleCallback?.(show) ?? show(), IDLE_MOUNT_DELAY_MS);
    };
    if (document.readyState === "complete") showWhenIdle();
    else window.addEventListener("load", showWhenIdle, { once: true });

    return () => {
      observer.disconnect();
      scrollTarget.removeEventListener("scroll", show);
      window.removeEventListener("load", showWhenIdle);
      window.clearTimeout(idleTimer);
    };
  }, [near]);

  return [ref, near];
}

// TerminalProvider is scoped to the home route here (rather than mounted in
// the root layout) so non-home routes do not pay the cost of importing
// `lib/terminalCommands.tsx` and allocating the initial transcript.
export default function HomeTerminalIsland() {
  const [placeholderRef, near] = useNearViewport();
  return (
    <TerminalProvider>
      {near ? <Terminal /> : <TerminalPlaceholder ref={placeholderRef} />}
    </TerminalProvider>
  );
}