"use client";

import { memo, type ReactNode } from "react";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart2, Github, Linkedin, Mail, MessageSquare, Settings, Trophy, type LucideIcon } from "lucide-react";
import { ThemeToggle } from '@/components/ThemeToggle';
import SoundToggleButton from '@/components/SoundToggleButton';
import GlobalVoiceFab from '@/components/voice/GlobalVoiceFab';
import { unlockSticker } from '@/hooks/useStickers';
import { SOCIAL_COLORS, Z_INDEX } from '@/lib/designTokens';
import { useAppHaptics } from '@/lib/haptics';
import { PERSONAL_LINKS } from '@/lib/links';
import { cn } from '@/lib/utils';

export interface SocialEntry {
    name: string;
    icon: LucideIcon;
    url: string;
    color: string;
}

export const SOCIALS: readonly SocialEntry[] = [
    { name: "GitHub", icon: Github, url: PERSONAL_LINKS.github, color: SOCIAL_COLORS.github },
    { name: "LinkedIn", icon: Linkedin, url: PERSONAL_LINKS.linkedin, color: SOCIAL_COLORS.linkedin },
    { name: "Email", icon: Mail, url: PERSONAL_LINKS.email, color: SOCIAL_COLORS.email },
    { name: "Codeforces", icon: BarChart2, url: PERSONAL_LINKS.codeforces, color: SOCIAL_COLORS.codeforces },
];

const RAIL_SOCIALS: readonly SocialEntry[] = [
    ...SOCIALS,
    { name: "CP History", icon: Trophy, url: PERSONAL_LINKS.cpHistory, color: SOCIAL_COLORS.cpHistory },
];

const RAIL_ICON_CLASS = "relative flex size-11 shrink-0 items-center justify-center rounded-full text-gray-400 transition-[color,transform] duration-[var(--dur-quick)] hover:scale-110 focus-ring";

export function onSocialPress(onPress: () => void) {
    onPress();
    unlockSticker('social-butterfly');
}

/** A rail item with a handwritten label that slides out to its left on hover or keyboard focus. */
function RailSlot({ label, children }: { label?: string; children: ReactNode }) {
    return (
        <div className="group/rail animate-social-link relative">
            {children}
            {label ? (
                <span className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded bg-white/85 px-2 py-1 font-hand text-sm text-gray-700 opacity-0 shadow-sm transition-opacity duration-[var(--dur-micro)] group-hover/rail:opacity-100 group-has-[:focus-visible]/rail:opacity-100 dark:bg-gray-800/85 dark:text-gray-200">
                    {label}
                </span>
            ) : null}
        </div>
    );
}

/** Desktop right rail: socials, then site tools. Mobile uses SiteDock instead. */
function SocialSidebar({ onFeedbackClick }: { onFeedbackClick: () => void }) {
    const { externalLink, openPanel } = useAppHaptics();
    const pathname = usePathname();

    return (
        <aside
            data-social-sidebar
            data-social-sidebar-frame
            data-social-sidebar-layout="desktop"
            className="fixed right-[var(--c-rail-right)] hidden flex-col items-center gap-2 md:flex"
            aria-label="Social links and site tools"
            style={{ zIndex: Z_INDEX.sidebar }}
        >
            {RAIL_SOCIALS.map((social) => (
                <RailSlot key={social.name} label={social.name}>
                    <a
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onSocialPress(externalLink)}
                        className={cn(RAIL_ICON_CLASS, social.color)}
                        aria-label={social.name}
                    >
                        <social.icon size={24} strokeWidth={2.2} aria-hidden="true" />
                    </a>
                </RailSlot>
            ))}

            <svg aria-hidden="true" viewBox="0 0 24 6" className="my-1 h-1.5 w-6 text-[var(--c-ink-faint)]">
                <path d="M1 3.5 C 6 1.5, 12 5, 23 2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>

            <RailSlot label="Talk to AI Dhruv">
                <GlobalVoiceFab className={cn(RAIL_ICON_CLASS, "text-indigo-500 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200")} />
            </RailSlot>
            <RailSlot label="Theme"><ThemeToggle /></RailSlot>
            <RailSlot><SoundToggleButton /></RailSlot>
            <RailSlot label="Send feedback">
                <button
                    type="button"
                    onClick={() => {
                        openPanel();
                        onFeedbackClick();
                    }}
                    data-feedback-trigger
                    className={cn(RAIL_ICON_CLASS, "hover:text-purple-600")}
                    aria-label="Open feedback form"
                >
                    <MessageSquare size={22} strokeWidth={2.2} aria-hidden="true" />
                </button>
            </RailSlot>
            {pathname !== '/settings' ? (
                <RailSlot label="Settings">
                    <Link href="/settings" onClick={openPanel} className={cn(RAIL_ICON_CLASS, "hover:text-emerald-600")} aria-label="Open settings">
                        <Settings size={22} strokeWidth={2.2} aria-hidden="true" />
                    </Link>
                </RailSlot>
            ) : null}
        </aside>
    );
}

export default memo(SocialSidebar);
