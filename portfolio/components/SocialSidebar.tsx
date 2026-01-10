"use client";

import * as React from "react";
import { motion } from "framer-motion";
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

const SocialLink = React.memo(function SocialLink({ social, isMobile, index }: { social: typeof SOCIALS[0], isMobile?: boolean, index?: number }) {
    if (isMobile) {
        return (
            <a
                key={social.name}
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`bg-[var(--c-paper)] text-gray-500 transition-all duration-200 ${social.color} p-2.5 rounded-full shadow-md border border-gray-200 dark:border-gray-700 active:scale-95`}
                title={social.name}
                aria-label={social.name}
            >
                <social.icon size={18} strokeWidth={2} />
            </a>
        );
    }

    return (
        <motion.a
            key={social.name}
            href={social.url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.5 + (index || 0) * 0.1, type: "spring" }}
            whileHover={{ scale: 1.2, rotate: [3, -4, 2, -3, 4, -2][(index || 0) % 6] }}
            className={`text-gray-400 transition-colors duration-300 ${social.color} relative group`}
            title={social.name}
            aria-label={social.name}
        >
            <div className="absolute inset-0 bg-gray-200/50 rounded-full scale-0 group-hover:scale-150 transition-transform -z-10 blur-sm" />
            <social.icon size={24} strokeWidth={2.5} className="md:w-7 md:h-7" />
            <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 text-sm font-hand font-bold text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none bg-white/80 px-2 py-1 rounded shadow-sm">
                {social.name}
            </span>
        </motion.a>
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
                    <SocialLink key={social.name} social={social} index={i} />
                ))}
                <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-gray-300 -z-20 -translate-x-1/2 hidden md:block opacity-30" />
            </div>

            {/* Mobile: Floating circular buttons at bottom */}
            <div
                className="md:hidden fixed bottom-4 left-[calc(50%+24px)] -translate-x-1/2 z-40 flex gap-2"
                role="complementary"
                aria-label="Social media links"
            >
                {/* Theme Toggle */}
                <MobileThemeButton />

                {SOCIALS.map((social) => (
                    <SocialLink key={social.name} social={social} isMobile />
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

    if (!mounted) return <div className="w-11 h-11" />;

    const isDark = resolvedTheme === 'dark';

    return (
        <button
            onClick={toggleTheme}
            className="bg-[var(--c-paper)] text-gray-500 hover:text-yellow-600 transition-all duration-200 p-2.5 rounded-full shadow-md border border-gray-200 dark:border-gray-700 active:scale-95"
            title="Toggle theme"
            aria-label="Toggle theme"
        >
            {isDark ? (
                <Sun size={18} strokeWidth={2} />
            ) : (
                <Moon size={18} strokeWidth={2} />
            )}
        </button>
    );
}
