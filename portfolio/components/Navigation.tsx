"use client";
import React, { useState, useCallback } from 'react';
import Link from 'next/link';
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
            {LINKS.map((item, i) => (
                <NavTab
                    key={item.name}
                    item={item}
                    index={i}
                    active={pathname === item.href}
                    hovered={hoveredTab === item.name}
                    onHoverStart={onHoverStart}
                    onHoverEnd={onHoverEnd}
                />
            ))}
        </nav>
    );
}

/** Individual nav tab — memoized so only the hovered/active tab re-renders */
const NavTab = React.memo(function NavTab({
    item,
    index,
    active,
    hovered,
    onHoverStart,
    onHoverEnd,
}: {
    item: { name: string; href: string };
    index: number;
    active: boolean;
    hovered: boolean;
    onHoverStart: (name: string) => void;
    onHoverEnd: () => void;
}) {
    const colorKey = COLOR_ORDER[index % COLOR_ORDER.length];
    const color = NAV_TAB_COLORS[colorKey];
    const y = active ? NAV_POSITIONS.active : hovered ? NAV_POSITIONS.hovered : NAV_POSITIONS.default;

    return (
        <Link href={item.href} legacyBehavior={false} passHref>
            <div
                onMouseEnter={() => onHoverStart(item.name)}
                onMouseLeave={onHoverEnd}
                className={cn(
                    `animate-nav-tab animate-nav-tab-${index + 1}`,
                    // cubic-bezier overshoot: GPU-composited, zero jitter, springy feel
                    "cursor-pointer transition-transform duration-300 ease-[cubic-bezier(0.22,1.8,0.50,1)]",
                    "pt-[var(--c-nav-tab-pt)] md:pt-[var(--c-nav-tab-pt-md)] pb-[var(--c-nav-tab-py)] md:pb-[var(--c-nav-tab-py-md)] px-[var(--c-nav-tab-px)] md:px-[var(--c-nav-tab-px-md)] rounded-b-lg shadow-md border-x-2 border-b-2 font-hand font-bold text-[length:var(--t-nav)] leading-[1.25rem] md:text-[length:var(--t-nav-md)] md:leading-[1.75rem] tracking-wide relative",
                    color.text, color.border,
                    active ? "z-20 scale-110 shadow-lg" : "z-10 opacity-90 hover:opacity-100"
                )}
                style={{
                    ...TAB_CLIP_STYLE,
                    backgroundColor: color.bg,
                    transform: `translateY(${y}px)`,
                }}
            >
                {item.name}
            </div>
        </Link>
    );
});
