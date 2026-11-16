"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Ellipsis, MessageSquare, Moon, PenLine, Settings, Sticker, Sun, Volume2, VolumeX } from 'lucide-react';
import GlobalVoiceFab from '@/components/voice/GlobalVoiceFab';
import { onSocialPress, SOCIALS } from '@/components/SocialSidebar';
import { useDiscoActive, useMasterVolume, useSoundsMuted, useStickerProgress } from '@/hooks/useStickers';
import { DOCK_TOKENS, Z_INDEX } from '@/lib/designTokens';
import { useAppHaptics } from '@/lib/haptics';
import { commitUserMasterVolume } from '@/lib/soundManager';
import { prepareThemeSounds, runThemeToggle } from '@/lib/themeToggleAction';
import { cn } from '@/lib/utils';

const ROUND = "flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[var(--c-grid)] bg-[var(--c-paper)]/85 text-[var(--c-ink-muted)] shadow-sticker transition-[color,transform] duration-[var(--dur-quick)] active:scale-95 focus-ring dark:border-gray-600";
const ROW = "flex min-h-11 items-center gap-3 rounded-xl px-2 font-hand text-lg text-[var(--c-ink)] transition-colors duration-[var(--dur-micro)] hover:bg-[var(--c-ink)]/5 focus-ring";
const DOCK_STYLE = { zIndex: Z_INDEX.sidebar } as const;

function DrawerRow({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link href={href} prefetch={false} className={ROW}>
      <span className="flex size-6 items-center justify-center text-[var(--c-ink-muted)]">{icon}</span>
      {children}
    </Link>
  );
}

/** Mobile chrome in one corner: Talk to AI Dhruv + More. Tucks away while reading down a page. */
export default function SiteDock({ onFeedbackClick }: { onFeedbackClick: () => void }) {
  const pathname = usePathname();
  const drawerId = useId();
  const dockRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  // Keyed by route so a new page always starts with the dock visible.
  const [tuck, setTuck] = useState({ path: pathname, tucked: false });
  const tucked = tuck.path === pathname && tuck.tucked;
  const { externalLink, openPanel, toggle } = useAppHaptics();
  const { setTheme, resolvedTheme } = useTheme();
  const discoActive = useDiscoActive();
  const muted = useSoundsMuted();
  const volume = Math.round(useMasterVolume() * 100);
  const { unlocked, total } = useStickerProgress();

  useEffect(() => {
    const drawer = drawerRef.current;
    if (drawer?.matches(':popover-open')) drawer.hidePopover();
  }, [pathname]);

  useEffect(() => {
    let lastTop = 0;
    let frame = 0;
    let scroller: HTMLElement | null = null;
    const setTucked = (next: boolean) => {
      const path = window.location.pathname;
      setTuck((prev) => (prev.path === path && prev.tucked === next ? prev : { path, tucked: next }));
    };
    const evaluate = () => {
      frame = 0;
      if (!scroller) return;
      const top = scroller.scrollTop;
      const delta = top - lastTop;
      const nearEnd = top + scroller.clientHeight >= scroller.scrollHeight - DOCK_TOKENS.bottomRevealPx;
      if (top < DOCK_TOKENS.hideAfterPx || nearEnd) {
        setTucked(false);
        lastTop = top;
      } else if (Math.abs(delta) > DOCK_TOKENS.scrollDeltaPx) {
        // Keyboard users keep the dock; a tapped button keeping focus should not pin it in place.
        const keyboardFocusInside = Boolean(dockRef.current?.querySelector(':focus-visible'));
        setTucked(delta > 0 && !keyboardFocusInside);
        lastTop = top;
      }
    };
    const onScroll = (event: Event) => {
      if (!(event.target instanceof HTMLElement) || !event.target.matches('[data-route-scroll-container]')) return;
      scroller = event.target;
      if (!frame) frame = requestAnimationFrame(evaluate);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      cancelAnimationFrame(frame);
    };
  }, []);

  if (pathname.startsWith('/chat')) return null;

  const themeLabel = discoActive ? 'Exit disco mode' : 'Toggle theme';

  return (
    <>
      <div
        ref={dockRef}
        data-site-dock
        data-mobile-social-frame
        data-tucked={tucked && !open}
        className="site-dock fixed bottom-[var(--c-dock-bottom)] right-[var(--c-dock-right)] flex -rotate-[1.5deg] items-center gap-1 rounded-full border-2 border-dashed border-[var(--c-grid)]/60 bg-[var(--c-paper)] p-1 shadow-sticker md:hidden"
        style={DOCK_STYLE}
      >
        <GlobalVoiceFab
          iconSize={20}
          className="flex size-11 items-center justify-center rounded-full text-indigo-600 transition-transform duration-[var(--dur-quick)] active:scale-95 focus-ring dark:text-indigo-300"
        />
        <button
          type="button"
          popoverTarget={drawerId}
          aria-expanded={open}
          aria-controls={drawerId}
          aria-label="More"
          onClick={toggle}
          className="flex size-11 items-center justify-center rounded-full text-[var(--c-ink-muted)] transition-transform duration-[var(--dur-quick)] active:scale-95 focus-ring"
        >
          <Ellipsis size={22} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>

      <div
        id={drawerId}
        ref={drawerRef}
        popover="auto"
        onToggle={(event) => {
          const isOpen = event.newState === 'open';
          setOpen(isOpen);
          if (isOpen) prepareThemeSounds();
          else setVolumeOpen(false);
        }}
        aria-label="Links and settings"
        className="site-drawer w-[min(15.5rem,calc(100vw-2rem))] rounded-3xl border-2 border-dashed border-[var(--c-grid)]/60 bg-[var(--c-paper)] p-2 text-[var(--c-ink)] shadow-md md:hidden"
      >
        <div className="grid grid-cols-4 justify-items-center gap-1" role="group" aria-label="Social links">
          {SOCIALS.map((social) => (
            <a
              key={social.name}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onSocialPress(externalLink)}
              className={cn(ROUND, social.color)}
              aria-label={social.name}
            >
              <social.icon size={16} strokeWidth={2.4} aria-hidden="true" />
            </a>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-4 justify-items-center gap-1 border-t border-dashed border-[var(--c-grid)]/60 pt-2" role="group" aria-label="Site tools">
          <button
            type="button"
            onClick={() => {
              toggle();
              runThemeToggle({ discoActive, isDark: resolvedTheme === 'dark', setTheme });
            }}
            className={cn(ROUND, "hover:text-amber-500")}
            aria-label={themeLabel}
            data-disco-bounce="1"
          >
            {resolvedTheme === 'dark' ? <Sun size={16} strokeWidth={2.4} aria-hidden="true" /> : <Moon size={16} strokeWidth={2.4} aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => {
              toggle();
              setVolumeOpen((value) => !value);
            }}
            aria-expanded={volumeOpen}
            aria-label="Adjust master volume"
            data-sound-toggle
            className={cn(ROUND, muted ? 'text-gray-400' : 'text-emerald-600 dark:text-emerald-400')}
          >
            {muted ? <VolumeX size={16} strokeWidth={2.4} aria-hidden="true" /> : <Volume2 size={16} strokeWidth={2.4} aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => {
              openPanel();
              drawerRef.current?.hidePopover();
              onFeedbackClick();
            }}
            data-feedback-trigger
            className={cn(ROUND, "hover:text-purple-600")}
            aria-label="Open feedback form"
          >
            <MessageSquare size={16} strokeWidth={2.4} aria-hidden="true" />
          </button>
          {pathname !== '/settings' ? (
            <Link href="/settings" onClick={openPanel} className={cn(ROUND, "hover:text-emerald-600")} aria-label="Open settings">
              <Settings size={16} strokeWidth={2.4} aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        {volumeOpen ? (
          <label className="mt-2 block px-2 font-hand text-sm text-[var(--c-ink-muted)]">
            Volume {volume}%
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={volume}
              aria-valuetext={`${volume} percent`}
              onChange={(event) => commitUserMasterVolume(Number(event.target.value) / 100)}
              className="master-volume-slider floating-volume-slider w-full"
            />
          </label>
        ) : null}

        <div className="mt-2 border-t border-dashed border-[var(--c-grid)]/60 pt-1">
          <DrawerRow href="/stickers" icon={<Sticker size={18} aria-hidden="true" />}>
            Sticker album <span className="ml-auto font-code text-sm text-[var(--c-ink-muted)]">{unlocked}/{total}</span>
          </DrawerRow>
          <DrawerRow href="/guestbook" icon={<PenLine size={18} aria-hidden="true" />}>Sign the guestbook</DrawerRow>
        </div>
      </div>
    </>
  );
}
