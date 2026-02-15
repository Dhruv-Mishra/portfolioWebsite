"use client";

import * as React from "react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
    const { setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    // useEffect only runs on the client, so now we can safely show the UI
    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="w-10 h-10" />; // Prevent layout shift
    }

    const toggleTheme = () => {
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
    };

    return (
        <button
            onClick={toggleTheme}
            className="relative p-2 rounded-full hover:bg-gray-200/20 dark:hover:bg-gray-700/20 transition-colors group"
            aria-label="Toggle Theme"
        >
            <div
                key={resolvedTheme}
                className="animate-theme-icon"
            >
                {resolvedTheme === "dark" ? (
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
            <div className="absolute inset-0 border-2 border-gray-400/0 group-hover:border-gray-400/30 rounded-full scale-110 opacity-0 group-hover:opacity-100 transition-all pointer-events-none" style={{ borderRadius: "50% 40% 60% 50% / 50% 60% 40% 50%" }}></div>
        </button>
    );
}
