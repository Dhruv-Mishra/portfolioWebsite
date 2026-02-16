"use client";

import * as React from "react";
import { m } from "framer-motion";
import { Github, Linkedin, Mail, Phone, BarChart2, Trophy, Sun, Moon, MessageSquare } from "lucide-react";
import { useTheme } from "next-themes";

const SOCIALS = [
    {
        name: "GitHub",
        icon: Github,
        url: "https://github.com/Dhruv-Mishra",
        color: "hover:text-gray-800"
    },
    {
        name: "LinkedIn",
        icon: Linkedin,
        url: "https://www.linkedin.com/in/dhruv-mishra-id/",
        color: "hover:text-blue-700"
    },
    {
        name: "Codeforces",
        icon: BarChart2,
        url: "https://codeforces.com/profile/DhruvMishra",
        color: "hover:text-yellow-600"
    },
    {
        name: "CP History",
        icon: Trophy,
        url: "https://zibada.guru/gcj/profile/Dhruv985",
        color: "hover:text-amber-500"
    },
    {
        name: "Email",
        icon: Mail,
        url: "mailto:dhruvmishra.id@gmail.com",
        color: "hover:text-red-600"
    },
    {
        name: "Phone",
        icon: Phone,
        url: "tel:+919599377944",
        color: "hover:text-green-600"
    }
];

// Hoisted per-index whileHover rotate values — avoids object allocation per render
const HOVER_ROTATIONS = [3, -4, 2, -3, 4, -2];
const DESKTOP_SPRING = { type: "spring" as const, stiffness: 400, damping: 15 };

const SocialLink = React.memo(function SocialLink({ social, isMobile, index }: { social: typeof SOCIALS[0], isMobile?: boolean, index?: number }) {
    if (isMobile) {
        return (
            <a
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-center w-10 h-10 bg-[var(--c-paper)] text-gray-500 transition-[color,transform] duration-200 ${social.color} rounded-full shadow-[1px_2px_4px_rgba(0,0,0,0.15)] border-2 border-dashed border-[var(--c-grid)] dark:border-gray-600 active:scale-95 font-hand`}
                title={social.name}
                aria-label={social.name}
            >
                <social.icon size={16} strokeWidth={2.5} />
            </a>
        );
    }

    return (
        <m.a
            href={social.url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1, transition: { delay: 0.5 + (index || 0) * 0.1, type: "spring" } }}
            whileHover={{ scale: 1.2, rotate: HOVER_ROTATIONS[(index || 0) % 6] }}
            transition={DESKTOP_SPRING}
            className={`text-gray-400 transition-colors duration-300 ${social.color} relative group`}
            title={social.name}
            aria-label={social.name}
        >
            <div className="absolute inset-0 bg-gray-200/50 rounded-full scale-0 group-hover:scale-150 transition-transform -z-10" />
            <social.icon size={24} strokeWidth={2.5} className="md:w-7 md:h-7" />
            <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 text-sm font-hand font-bold text-gray-600 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none bg-white/80 dark:bg-gray-800/80 px-2 py-1 rounded shadow-sm">
                {social.name}
            </span>
        </m.a>
    );
});

// Pre-computed mobile social list (CP History replaced by feedback button)
const MOBILE_SOCIALS = SOCIALS.filter(s => s.name !== 'CP History');

export default function SocialSidebar({ onFeedbackClick }: { onFeedbackClick?: () => void }) {
    return (
        <>
            {/* Desktop: Vertical sidebar on right */}
            <div
                className="hidden md:flex fixed right-4 md:right-8 top-1/2 -translate-y-1/2 z-40 flex-col gap-6"
                role="complementary"
                aria-label="Social media links"
            >
                {SOCIALS.map((social, i) => (
                    <SocialLink key={social.name} social={social} index={i} />
                ))}
                <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-gray-300 -z-20 -translate-x-1/2 hidden md:block opacity-30" />
            </div>

            {/* Mobile: Floating circular buttons at bottom — offset by half the spiral width (w-12 = 48px → 24px) to center within the content area */}
            <div
                className="md:hidden fixed bottom-4 left-[calc(50%+24px)] -translate-x-1/2 z-40 flex items-center gap-1.5 bg-[var(--c-paper)] px-3 py-2 rounded-full shadow-md border-2 border-dashed border-[var(--c-grid)]/50"
                role="complementary"
                aria-label="Social media links"
            >
                {/* Theme Toggle */}
                <MobileThemeButton />

                {MOBILE_SOCIALS.map((social) => (
                    <SocialLink key={social.name} social={social} isMobile />
                ))}

                {/* Feedback button (replaces CP History on mobile) */}
                {onFeedbackClick && (
                    <button
                        onClick={onFeedbackClick}
                        className="flex items-center justify-center w-10 h-10 bg-[var(--c-paper)] text-gray-500 hover:text-purple-600 transition-[color,transform] duration-200 rounded-full shadow-[1px_2px_4px_rgba(0,0,0,0.15)] border-2 border-dashed border-[var(--c-grid)] dark:border-gray-600 active:scale-95 font-hand"
                        title="Send feedback"
                        aria-label="Open feedback form"
                    >
                        <MessageSquare size={16} strokeWidth={2.5} />
                    </button>
                )}
            </div>
        </>
    );
}


// Mobile-only theme toggle button
function MobileThemeButton() {
    const { setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    const toggleTheme = () => {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
    };

    if (!mounted) return <div className="w-10 h-10" />;

    const isDark = resolvedTheme === 'dark';

    return (
        <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-10 h-10 bg-[var(--c-paper)] text-gray-500 hover:text-yellow-600 transition-[color,transform] duration-200 rounded-full shadow-[1px_2px_4px_rgba(0,0,0,0.15)] border-2 border-dashed border-[var(--c-grid)] dark:border-gray-600 active:scale-95 font-hand"
            title="Toggle theme"
            aria-label="Toggle theme"
        >
            {isDark ? (
                <Sun size={16} strokeWidth={2.5} />
            ) : (
                <Moon size={16} strokeWidth={2.5} />
            )}
        </button>
    );
}
