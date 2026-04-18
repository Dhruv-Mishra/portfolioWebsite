"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { useAppHaptics } from "@/lib/haptics";
import { useDiscoActive } from "@/hooks/useStickers";
import { runThemeToggle } from "@/lib/themeToggleAction";

export function ThemeToggle() {
    const { setTheme, resolvedTheme } = useTheme();
    const { toggle } = useAppHaptics();
    const discoActive = useDiscoActive();
    const [mounted, setMounted] = React.useState(false);

    // useEffect only runs on the client, so now we can safely show the UI
    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="w-10 h-10" />; // Prevent layout shift
    }

    const handleClick = () => {
        toggle();
        // Shared handler — identical code path with the mobile button in
        // `SocialSidebar`. Exits disco when active; otherwise cycles theme.
        runThemeToggle({
            discoActive,
            isDark: resolvedTheme === 'dark',
            setTheme,
        });
    };

    const ariaLabel = discoActive ? "Exit disco mode" : "Toggle Theme";

    return (
        <button
            onClick={handleClick}
            className="relative p-2 rounded-full hover:bg-gray-200/20 dark:hover:bg-gray-700/20 transition-colors group"
            aria-label={ariaLabel}
            data-disco-bounce="1"
        >
            <div
                key={discoActive ? 'disco' : resolvedTheme}
                className="animate-theme-icon"
            >
                {discoActive ? (
                    /* Disco Ball Doodle — rendered only while disco mode is on. */
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-fuchsia-500">
                        {/* Hanger */}
                        <path d="M12 2v3" />
                        {/* Ball */}
                        <circle cx="12" cy="13" r="7" className="fill-fuchsia-200/40 dark:fill-fuchsia-900/40" />
                        {/* Facet lines */}
                        <path d="M5 13h14" opacity="0.55" />
                        <path d="M12 6v14" opacity="0.55" />
                        <path d="M7 9c1.5 2 8 2 10 0" opacity="0.45" />
                        <path d="M7 17c1.5-2 8-2 10 0" opacity="0.45" />
                        <path d="M9 7.2c0.9 3 5.1 3 6 0" opacity="0.35" />
                        <path d="M9 18.8c0.9-3 5.1-3 6 0" opacity="0.35" />
                        {/* Sparkles */}
                        <path d="M2.5 7.5l1.5-1" opacity="0.6" />
                        <path d="M21.5 16.5l-1.5-1" opacity="0.6" />
                    </svg>
                ) : resolvedTheme === "dark" ? (
                    /* Moon Doodle */
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-100">
                        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                        <path d="M19 3v2" className="opacity-50" />
                        <path d="M21 5h-2" className="opacity-50" />
                    </svg>
                ) : (
                    /* Sun Doodle */
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2" />
                        <path d="M12 20v2" />
                        <path d="m4.93 4.93 1.41 1.41" />
                        <path d="m17.66 17.66 1.41 1.41" />
                        <path d="M2 12h2" />
                        <path d="M20 12h2" />
                        <path d="m6.34 17.66-1.41 1.41" />
                        <path d="m19.07 4.93-1.41 1.41" />
                    </svg>
                )}
            </div>

            {/* Rough circle hover effect that looks drawn */}
            <div className="absolute inset-0 border-2 border-gray-400/0 group-hover:border-gray-400/30 rounded-full scale-110 opacity-0 group-hover:opacity-100 transition-[border-color,opacity] duration-150 pointer-events-none" style={{ borderRadius: "50% 40% 60% 50% / 50% 60% 40% 50%" }}></div>
        </button>
    );
}
