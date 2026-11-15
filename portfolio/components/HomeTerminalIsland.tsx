"use client";

import dynamic from "next/dynamic";
import { TerminalProvider } from "@/context/TerminalContext";
import { SKETCH_RADIUS, TERMINAL_COLORS } from "@/lib/designTokens";

const SHELL_STYLE = { borderRadius: SKETCH_RADIUS.terminal, backgroundColor: TERMINAL_COLORS.bg } as const;
const HEADER_STYLE = { backgroundColor: TERMINAL_COLORS.headerBg } as const;

// Same footprint as the real terminal, so the client-only swap neither flashes nor shifts layout.
const Terminal = dynamic(() => import("@/components/Terminal"), {
  loading: () => (
    <div aria-hidden="true" className={`mx-auto w-full max-w-[var(--c-terminal-max-w)] overflow-hidden border-[3px] ${TERMINAL_COLORS.border}`} style={SHELL_STYLE}>
      <div className={`h-[3.25rem] border-b-2 md:h-[3.5rem] ${TERMINAL_COLORS.headerBorder}`} style={HEADER_STYLE} />
      <div className="h-[var(--c-terminal-h)] md:h-[var(--c-terminal-h-md)]" />
    </div>
  ),
  ssr: false,
});

// TerminalProvider is scoped to the home route here (rather than mounted in
// the root layout) so non-home routes do not pay the cost of importing
// `lib/terminalCommands.tsx` and allocating the initial transcript.
export default function HomeTerminalIsland() {
  return (
    <TerminalProvider>
      <Terminal />
    </TerminalProvider>
  );
}
