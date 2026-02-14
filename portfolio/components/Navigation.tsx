"use client";
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { m } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
    { name: 'Home', href: '/' },
    { name: 'Projects', href: '/projects' },
    { name: 'About', href: '/about' },
    { name: 'Resume', href: '/resume' },
    { name: 'Chat', href: '/chat' },
];

const COLORS = [
    "bg-[#ff9b9b] text-red-900 border-red-300", // Pink
    "bg-[#fff9c4] text-yellow-900 border-yellow-300", // Yellow
    "bg-[#c5e1a5] text-green-900 border-green-300", // Green
    "bg-[#b3e5fc] text-blue-900 border-blue-300",    // Blue for Resume
    "bg-[#ffccbc] text-orange-900 border-orange-300" // Coral for Chat
];

export default function Navigation() {
    const pathname = usePathname();
    const [hoveredTab, setHoveredTab] = useState<string | null>(null);

    const onHoverStart = useCallback((name: string) => setHoveredTab(name), []);
    const onHoverEnd = useCallback(() => setHoveredTab(null), []);

    return (
        <nav
            className="fixed top-0 left-0 w-full md:w-auto md:left-auto md:right-12 z-50 flex justify-center md:justify-end gap-2 md:gap-4 perspective-[500px]"
            aria-label="Main navigation"
            role="navigation"
        >
            {LINKS.map((item, i) => {
                const active = pathname === item.href;
                const isHovered = hoveredTab === item.name;

                return (
                    <Link
                        key={item.name}
                        href={item.href}
                        legacyBehavior={false}
                        passHref
                    >
                        <m.div
                            // Merge hover into animate to avoid whileHover gesture priority conflicts.
                            // whileHover overrides animate, which caused tabs to stay "pulled down"
                            // after navigating away while the cursor was still on the old tab.
                            animate={{
                                y: active ? -5 : isHovered ? -10 : -25,
                            }}
                            onHoverStart={() => onHoverStart(item.name)}
                            onHoverEnd={onHoverEnd}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            className={cn(
                                // CSS animation for initial render (faster LCP)
                                `animate-nav-tab animate-nav-tab-${i + 1}`,
                                "cursor-pointer pt-12 md:pt-16 pb-3 md:pb-4 px-3 md:px-5 rounded-b-lg shadow-md border-x-2 border-b-2 font-hand font-bold text-sm md:text-xl tracking-wide relative",
                                COLORS[i % COLORS.length],
                                active ? "z-20 scale-110 shadow-lg" : "z-10 opacity-90 hover:opacity-100"
                            )}
                            style={{
                                clipPath: 'polygon(0% 0%, 100% 0%, 90% 100%, 10% 100%)'
                            }}
                        >
                            {item.name}
                        </m.div>
                    </Link>
                );
            })}
        </nav>
    );
}
