"use client";
import React, { useCallback, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { canWarmNoncriticalAssets } from '@/lib/assetPrefetch';
import { useAppHaptics } from '@/lib/haptics';
import {
  getPageTurnSnapshot,
  getServerPageTurnSnapshot,
  subscribeToPageTurn,
} from '@/lib/pageTurn';
import { cn } from '@/lib/utils';
import { NAV_TAB_COLORS, NAV_POSITIONS, Z_INDEX } from '@/lib/designTokens';

interface NavItem {
    name: string;
    href: string;
    prefetch?: false;
}

const LINKS: NavItem[] = [
    { name: 'Home', href: '/' },
    { name: 'Projects', href: '/projects', prefetch: false },
    { name: 'About', href: '/about' },
    { name: 'Resume', href: '/resume', prefetch: false },
    { name: 'Chat', href: '/chat', prefetch: false },
];

const COLOR_ORDER = ['pink', 'yellow', 'green', 'blue', 'coral'] as const;

// Hoisted static styles — avoids allocation per render
const TAB_CLIP_STYLE = { clipPath: 'polygon(0% 0%, 100% 0%, 90% 100%, 10% 100%)' } as const;

function shouldIntentPrefetch() {
    return canWarmNoncriticalAssets();
}

export default function Navigation() {
    const pathname = usePathname();
    const router = useRouter();
    const { navigate } = useAppHaptics();
    const [hoveredTab, setHoveredTab] = useState<string | null>(null);
    const transition = useSyncExternalStore(
        subscribeToPageTurn,
        getPageTurnSnapshot,
        getServerPageTurnSnapshot,
    );
    const visualPath = transition?.toPath ?? pathname;

    const onHoverStart = useCallback((name: string) => setHoveredTab(name), []);
    const onHoverEnd = useCallback(() => setHoveredTab(null), []);
    const onIntentPrefetch = useCallback((href: string) => {
        if (!shouldIntentPrefetch()) return;
        router.prefetch(href);
    }, [router]);

    return (
        <nav
            className="fixed top-0 left-0 w-full md:w-auto md:left-auto md:right-12 flex flex-nowrap justify-center md:justify-end gap-1 sm:gap-2 md:gap-4 perspective-[500px]"
            aria-label="Main navigation"
            style={{ zIndex: Z_INDEX.nav }}
        >
            {LINKS.map((item, i) => (
                <NavTab
                    key={item.name}
                    item={item}
                    index={i}
                    active={visualPath === item.href}
                    hovered={hoveredTab === item.name}
                    onHoverStart={onHoverStart}
                    onHoverEnd={onHoverEnd}
                    onIntentPrefetch={onIntentPrefetch}
                    onPress={navigate}
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
    onIntentPrefetch,
    onPress,
}: {
    item: NavItem;
    index: number;
    active: boolean;
    hovered: boolean;
    onHoverStart: (name: string) => void;
    onHoverEnd: () => void;
    onIntentPrefetch: (href: string) => void;
    onPress: () => void;
}) {
    const colorKey = COLOR_ORDER[index % COLOR_ORDER.length];
    const color = NAV_TAB_COLORS[colorKey];
    const y = active ? NAV_POSITIONS.active : hovered ? NAV_POSITIONS.hovered : NAV_POSITIONS.default;

    return (
        <Link
            href={item.href}
            prefetch={item.prefetch}
            legacyBehavior={false}
            passHref
            onClick={onPress}
            onFocus={() => onIntentPrefetch(item.href)}
            onTouchStart={() => onIntentPrefetch(item.href)}
            // Focus-visible ring lives on the anchor (the natural focus target)
            // rather than the inner clip-pathed div, so the ring is never cut
            // off by the tab's jagged bottom edge and keyboard users can reach
            // every nav tab with a clear indicator.
            className="rounded-b-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            {...(active ? { 'aria-current': 'page' as const } : {})}
        >
            <div
                onMouseEnter={() => {
                    onHoverStart(item.name);
                    onIntentPrefetch(item.href);
                }}
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
