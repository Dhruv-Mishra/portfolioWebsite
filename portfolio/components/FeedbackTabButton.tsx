"use client";

import { MessageSquare } from "lucide-react";
import { useAppHaptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { Z_INDEX } from "@/lib/designTokens";

export default function FeedbackTabButton({ onClick }: { onClick: () => void }) {
    const { openPanel } = useAppHaptics();

    return (
        <button
            onClick={() => {
                openPanel();
                onClick();
            }}
            style={{ zIndex: Z_INDEX.sidebar }}
            className={cn(
                "hidden md:flex fixed bottom-20 right-4 md:right-8",
                "w-10 h-10 md:w-11 md:h-11 rounded-full",
                "bg-[var(--c-paper)] border-2 border-dashed border-[var(--c-grid)]/50",
                "shadow-md hover:shadow-lg",
                "items-center justify-center",
                "text-[var(--c-ink)] opacity-50 hover:opacity-100",
                "transition-[opacity,transform,box-shadow] duration-150 hover:scale-110 hover:-rotate-6 active:scale-95",
            )}
            title="Send feedback"
            aria-label="Open feedback form"
        >
            <MessageSquare size={18} className="md:w-5 md:h-5" />
        </button>
    );
}