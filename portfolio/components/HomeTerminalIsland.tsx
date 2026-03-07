"use client";

import dynamic from "next/dynamic";
import { TerminalProvider } from "@/context/TerminalContext";

const Terminal = dynamic(() => import("@/components/Terminal"), {
  loading: () => (
    <div className="h-[var(--c-terminal-h-md)] animate-pulse rounded-lg border-2 border-dashed border-gray-300 bg-gray-800/10" />
  ),
  ssr: false,
});

export default function HomeTerminalIsland() {
  return (
    <TerminalProvider>
      <Terminal />
    </TerminalProvider>
  );
}