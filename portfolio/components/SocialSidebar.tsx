"use client";

import * as React from "react";
import { Github, Linkedin, Mail, Phone, BarChart2, Trophy, Sun, Moon } from "lucide-react";
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

// Desktop social link - uses CSS transitions instead of framer-motion
const DesktopSocialLink = React.memo(function DesktopSocialLink({ social, index }: { social: typeof SOCIALS[0], index: number }) {
    return (
        <a
            href={social.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-gray-400 transition-all duration-300 ${social.color} relative group animate-social-slide-in hover:scale-[1.2]`}
            title={social.name}
            style={{ animationDelay: `${500 + index * 100}ms` }}
        >
            <div className="absolute inset-0 bg-gray-200/50 rounded-full scale-0 group-hover:scale-150 transition-transform -z-10 blur-sm" />
            <social.icon size={24} strokeWidth={2.5} className="md:w-7 md:h-7" />
            <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 text-sm font-hand font-bold text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none bg-white/80 px-2 py-1 rounded shadow-sm">
                {social.name}
            </span>
        </a>
    );
});

// Mobile social link - simple and fast
const MobileSocialLink = React.memo(function MobileSocialLink({ social }: { social: typeof SOCIALS[0] }) {
    return (
        <a
            href={social.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`bg-[var(--c-paper)] text-gray-500 transition-all duration-200 ${social.color} p-2.5 rounded-full shadow-md border border-gray-200 dark:border-gray-700 active:scale-95 cursor-auto`}
            title={social.name}
        >
            <social.icon size={18} strokeWidth={2} />
        </a>
    );
});

export default function SocialSidebar() {
    return (
        <>
            {/* Desktop: Vertical sidebar on right */}
            <div
                className="hidden md:flex fixed right-4 md:right-8 top-1/2 -translate-y-1/2 z-40 flex-col gap-6"
                role="complementary"
                aria-label="Social media links"
            >
                {SOCIALS.map((social, i) => (
                    <DesktopSocialLink key={social.name} social={social} index={i} />
                ))}
                <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-gray-300 -z-20 -translate-x-1/2 hidden md:block opacity-30" />
            </div>

            {/* Mobile: Floating circular buttons at bottom - fixed height to prevent CLS */}
            <div
                className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex gap-2 h-11"
                role="complementary"
                aria-label="Social media links"
                style={{ 
                    // Explicit dimensions to prevent layout shift
                    minHeight: '44px',
                    contain: 'layout style'
                }}
            >
                {/* Theme Toggle */}
                <MobileThemeButton />

                {SOCIALS.map((social) => (
                    <MobileSocialLink key={social.name} social={social} />
                ))}
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

    // Return placeholder with same dimensions to prevent CLS
    if (!mounted) return <div className="w-11 h-11 rounded-full" />;

    const isDark = resolvedTheme === 'dark';

    return (
        <button
            onClick={toggleTheme}
            className="bg-[var(--c-paper)] text-gray-500 hover:text-yellow-600 transition-all duration-200 p-2.5 rounded-full shadow-md border border-gray-200 dark:border-gray-700 active:scale-95 cursor-auto w-11 h-11 flex items-center justify-center"
            title="Toggle theme"
        >
            {isDark ? (
                <Sun size={18} strokeWidth={2} />
            ) : (
                <Moon size={18} strokeWidth={2} />
            )}
        </button>
    );
}
