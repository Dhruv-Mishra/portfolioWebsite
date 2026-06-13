"use client";

import dynamic from "next/dynamic";
import { TerminalProvider } from "@/context/TerminalContext";

const Terminal = dynamic(() => import("@/components/Terminal"), {
  loading: () => (
    <div className="h-[var(--c-terminal-h-md)] animate-pulse rounded-lg border-2 border-dashed border-gray-300 bg-gray-800/10" />
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