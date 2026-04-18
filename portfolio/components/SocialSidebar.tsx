"use client";

import * as React from "react";
import { Github, Linkedin, Mail, Phone, BarChart2, Trophy, MessageSquare, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useAppHaptics } from '@/lib/haptics';
import { stickerBus } from '@/lib/stickerBus';
import { SOCIAL_COLORS, Z_INDEX } from '@/lib/designTokens';
import { PERSONAL_LINKS } from '@/lib/links';
import { useDiscoActive } from '@/hooks/useStickers';
import { runThemeToggle } from '@/lib/themeToggleAction';
// Note: soundManager import removed — the mobile theme button now routes
// audio playback through `runThemeToggle` so the desktop + mobile handlers
// share exactly one code path. The shared helper owns the cricket/rooster
// audio call itself.

const SOCIALS = [
    {
        name: "GitHub",
        icon: Github,
        url: PERSONAL_LINKS.github,
        color: SOCIAL_COLORS.github
    },
    {
        name: "LinkedIn",
        icon: Linkedin,
        url: PERSONAL_LINKS.linkedin,
        color: SOCIAL_COLORS.linkedin
    },
    {
        name: "Codeforces",
        icon: BarChart2,
        url: PERSONAL_LINKS.codeforces,
        color: SOCIAL_COLORS.codeforces
    },
    {
        name: "CP History",
        icon: Trophy,
        url: PERSONAL_LINKS.cpHistory,
        color: SOCIAL_COLORS.cpHistory
    },
    {
        name: "Email",
        icon: Mail,
        url: PERSONAL_LINKS.email,
        color: SOCIAL_COLORS.email
    },
    {
        name: "Phone",
        icon: Phone,
        url: PERSONAL_LINKS.phone,
        color: SOCIAL_COLORS.phone
    }
];

const SocialLink = React.memo(function SocialLink({ social, isMobile, index, onPress }: { social: typeof SOCIALS[0], isMobile?: boolean, index?: number, onPress: () => void }) {
    const handleClick = () => {
        onPress();
        // Social link click → social-butterfly. Idempotent via store dedupe.
        stickerBus.emit('social-butterfly');
    };
    if (isMobile) {
        return (
            <a
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleClick}
                // Responsive sizing: 36px on narrow phones (iPhone SE 320px, iPhone 12 mini 375px)
                // where horizontal space is tight; grows to 44px from `sm:` (≥640px) to meet
                // Apple HIG's recommended touch target. A 36px tap target on a 320px viewport
                // still respects the WCAG 2.2 24×24 minimum and leaves the row inside the
                // content column minus the binding spine. Focus ring added for keyboard users
                // navigating via external keyboard on iPad Safari.
                className={`flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 bg-[var(--c-paper)] text-gray-500 transition-[color,transform] duration-200 ${social.color} rounded-full shadow-[1px_2px_4px_rgba(0,0,0,0.15)] border-2 border-dashed border-[var(--c-grid)] dark:border-gray-600 active:scale-95 font-hand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500`}
                title={social.name}
                aria-label={social.name}
            >
                <social.icon size={15} strokeWidth={2.5} />
            </a>
        );
    }

    return (
        <a
            href={social.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleClick}
            className={`animate-social-link text-gray-400 transition-[color,transform] duration-300 ${social.color} relative group hover:scale-110`}
            title={social.name}
            aria-label={social.name}
            style={{ animationDelay: `${0.5 + ((index || 0) * 0.1)}s` }}
        >
            <div className="absolute inset-0 bg-gray-200/50 rounded-full scale-0 group-hover:scale-150 transition-transform -z-10" />
            <social.icon size={24} strokeWidth={2.5} className="md:w-7 md:h-7" />
            <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 text-sm font-hand font-bold text-gray-600 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none bg-white/80 dark:bg-gray-800/80 px-2 py-1 rounded shadow-sm">
                {social.name}
            </span>
        </a>
    );
});

// Pre-computed mobile social list (CP History replaced by feedback button)
const MOBILE_SOCIALS = SOCIALS.filter(s => s.name !== 'CP History');

/**
 * Mobile theme button — mirrors the desktop `ThemeToggle` behaviour so the
 * two buttons stay in lock-step. Subscribes to `discoActive` (Bug 2c) so
 * that while disco is engaged the button paints the disco-ball doodle
 * instead of the sun/moon, and flips its aria-label to "Exit disco mode".
 * The click handler routes through the shared `runThemeToggle` helper (Bug
 * 2b) so we have exactly ONE code path that clears the disco flag — any
 * remnants previously seen on mobile (sparkles / spotlights / body
 * gradient) stuck around because the old handler only flipped the
 * `next-themes` preference without touching `discoActive`.
 *
 * Visual placeholder dimensions are unchanged — the pre-mount
 * `w-9 h-9 sm:w-11 sm:h-11` shell keeps the neighbouring social icons
 * from shuffling on hydrate.
 */
const MobileThemeButton = React.memo(function MobileThemeButton({ onPress }: { onPress: () => void }) {
    const { setTheme, resolvedTheme } = useTheme();
    const discoActive = useDiscoActive();
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => { setMounted(true); }, []);
    if (!mounted) return <div className="w-9 h-9 sm:w-11 sm:h-11" />;
    const isDark = resolvedTheme === 'dark';
    const ariaLabel = discoActive ? 'Exit disco mode' : 'Toggle theme';
    return (
        <button
            onClick={() => {
                onPress();
                runThemeToggle({ discoActive, isDark, setTheme });
            }}
            className="flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 bg-[var(--c-paper)] text-gray-500 transition-[color,transform] duration-200 hover:text-amber-500 rounded-full shadow-[1px_2px_4px_rgba(0,0,0,0.15)] border-2 border-dashed border-[var(--c-grid)] dark:border-gray-600 active:scale-95 font-hand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            title={ariaLabel}
            aria-label={ariaLabel}
            data-disco-bounce="1"
        >
            {discoActive ? (
                /* Disco ball — matches the desktop `ThemeToggle` variant. Scaled
                   to 16px so it matches the sun / moon footprint at the 15px
                   lucide sizes we ship elsewhere in the mobile pill. */
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-fuchsia-500">
                    <path d="M12 2v3" />
                    <circle cx="12" cy="13" r="7" className="fill-fuchsia-200/40 dark:fill-fuchsia-900/40" />
                    <path d="M5 13h14" opacity="0.55" />
                    <path d="M12 6v14" opacity="0.55" />
                    <path d="M7 9c1.5 2 8 2 10 0" opacity="0.45" />
                    <path d="M7 17c1.5-2 8-2 10 0" opacity="0.45" />
                    <path d="M9 7.2c0.9 3 5.1 3 6 0" opacity="0.35" />
                    <path d="M9 18.8c0.9-3 5.1-3 6 0" opacity="0.35" />
                    <path d="M2.5 7.5l1.5-1" opacity="0.6" />
                    <path d="M21.5 16.5l-1.5-1" opacity="0.6" />
                </svg>
            ) : isDark ? (
                <Sun size={15} strokeWidth={2.5} />
            ) : (
                <Moon size={15} strokeWidth={2.5} />
            )}
        </button>
    );
});

// Mobile sound toggle lives in `MobileSoundToggleFab`, a dedicated floating
// FAB rendered by `SketchbookLayout` above the MiniChat FAB. The social pill
// no longer carries a mute button so we don't double-render the control on
// narrow viewports.

export default function SocialSidebar({ onFeedbackClick }: { onFeedbackClick?: () => void }) {
    const { externalLink, openPanel, toggle } = useAppHaptics();

    return (
        <>
            {/* Desktop: Vertical sidebar on right */}
            <div
                className="hidden md:flex fixed right-4 md:right-8 top-1/2 -translate-y-1/2 flex-col gap-6"
                role="complementary"
                aria-label="Social media links"
                style={{ zIndex: Z_INDEX.sidebar }}
            >
                {SOCIALS.map((social, i) => (
                    <SocialLink key={social.name} social={social} index={i} onPress={externalLink} />
                ))}
                <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-gray-300 -z-20 -translate-x-1/2 hidden md:block opacity-30" />
            </div>

            {/* Mobile: Floating circular buttons at bottom — offset by half the binding width to center within the content area.
                max-w caps the pill to 92vw so on very narrow viewports (iPhone SE 320px) the pill fits
                inside the content column even if an OS-level minimum font size or a11y scale inflates child widths. */}
            <div
                className="md:hidden fixed bottom-4 left-[calc(50%+var(--c-binding-w)/2)] -translate-x-1/2 flex items-center gap-1 sm:gap-1.5 bg-[var(--c-paper)] px-2 sm:px-3 py-1.5 sm:py-2 rounded-full shadow-md border-2 border-dashed border-[var(--c-grid)]/50 max-w-[calc(100vw-var(--c-binding-w)-1rem)]"
                role="complementary"
                aria-label="Social media links"
                style={{ zIndex: Z_INDEX.sidebar }}
            >
                {/* Theme Toggle */}
                <MobileThemeButton onPress={toggle} />

                {MOBILE_SOCIALS.map((social) => (
                    <SocialLink key={social.name} social={social} isMobile onPress={externalLink} />
                ))}

                {/* Feedback button (replaces CP History on mobile) */}
                {onFeedbackClick && (
                    <button
                        onClick={() => {
                            openPanel();
                            onFeedbackClick();
                        }}
                        className="flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 bg-[var(--c-paper)] text-gray-500 hover:text-purple-600 transition-[color,transform] duration-200 rounded-full shadow-[1px_2px_4px_rgba(0,0,0,0.15)] border-2 border-dashed border-[var(--c-grid)] dark:border-gray-600 active:scale-95 font-hand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500"
                        title="Send feedback"
                        aria-label="Open feedback form"
                    >
                        <MessageSquare size={15} strokeWidth={2.5} />
                    </button>
                )}
            </div>
        </>
    );
}

