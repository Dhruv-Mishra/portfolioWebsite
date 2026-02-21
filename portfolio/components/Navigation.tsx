"use client";
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { m } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { NAV_TAB_COLORS, NAV_POSITIONS } from '@/lib/designTokens';

const LINKS = [
    { name: 'Home', href: '/' },
    { name: 'Projects', href: '/projects' },
    { name: 'About', href: '/about' },
    { name: 'Resume', href: '/resume' },
    { name: 'Chat', href: '/chat' },
];

const COLOR_ORDER = ['pink', 'yellow', 'green', 'blue', 'coral'] as const;

// Hoisted static styles — avoids allocation per render
const TAB_CLIP_STYLE = { clipPath: 'polygon(0% 0%, 100% 0%, 90% 100%, 10% 100%)' } as const;
const TAB_SPRING = { type: "spring" as const, stiffness: 300, damping: 20 };

export default function Navigation() {
    const pathname = usePathname();
    const [hoveredTab, setHoveredTab] = useState<string | null>(null);

    const onHoverStart = useCallback((name: string) => setHoveredTab(name), []);
    const onHoverEnd = useCallback(() => setHoveredTab(null), []);

    return (
        <nav
            className="fixed top-0 left-0 w-full md:w-auto md:left-auto md:right-12 z-50 flex justify-center md:justify-end gap-2 md:gap-4 perspective-[500px]"
            aria-label="Main navigation"
        >
            {LINKS.map((item, i) => {
                const active = pathname === item.href;
                const isHovered = hoveredTab === item.name;
                const colorKey = COLOR_ORDER[i % COLOR_ORDER.length];
                const color = NAV_TAB_COLORS[colorKey];

                return (
                    <Link
                        key={item.name}
                        href={item.href}
                        legacyBehavior={false}
                        passHref
                    >
                        <m.div
                            animate={{
                                y: active ? NAV_POSITIONS.active : isHovered ? NAV_POSITIONS.hovered : NAV_POSITIONS.default,
                            }}
                            onHoverStart={() => onHoverStart(item.name)}
                            onHoverEnd={onHoverEnd}
                            transition={TAB_SPRING}
                            className={cn(
                                `animate-nav-tab animate-nav-tab-${i + 1}`,
                                "cursor-pointer pt-[var(--c-nav-tab-pt)] md:pt-[var(--c-nav-tab-pt-md)] pb-[var(--c-nav-tab-py)] md:pb-[var(--c-nav-tab-py-md)] px-[var(--c-nav-tab-px)] md:px-[var(--c-nav-tab-px-md)] rounded-b-lg shadow-md border-x-2 border-b-2 font-hand font-bold text-[length:var(--t-nav)] leading-[1.25rem] md:text-[length:var(--t-nav-md)] md:leading-[1.75rem] tracking-wide relative",
                                color.text, color.border,
                                active ? "z-20 scale-110 shadow-lg" : "z-10 opacity-90 hover:opacity-100"
                            )}
                            style={{ ...TAB_CLIP_STYLE, backgroundColor: color.bg }}
                        >
                            {item.name}
                        </m.div>
                    </Link>
                );
            })}
        </nav>
    );
}
