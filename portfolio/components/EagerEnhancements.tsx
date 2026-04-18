"use client";

import dynamic from 'next/dynamic';
import { useDesktopOnly } from '@/hooks/useDesktopOnly';

/**
 * EagerEnhancements — a tiny, always-mounted client component that boots the
 * keyboard-driven layer of the site. Unlike `DeferredEnhancements`, these
 * providers must be present before the user's first keystroke, so we don't
 * gate them on `requestIdleCallback`.
 *
 * Each provider handles its own lazy-loading of the actual UI body — the
 * palette / overlay components are `dynamic(ssr:false)` inside each provider,
 * so the palette's icon pack (for example) is never in the initial bundle.
 *
 * Some mounts (Agent D's trackers) are resolved dynamically so that this
 * component builds cleanly even while those files are landing; Next.js will
 * error at build time if they're still missing by that point.
 *
 * Mobile gating: the command palette, shortcuts overlay, and shortcut hint
 * are keyboard-only surfaces. On touch-only devices (no hover, coarse
 * pointer) we skip rendering them entirely — which means their dynamic
 * chunks are never fetched either. Trackers + Konami listener stay eager
 * on all viewports because they work without a keyboard (Konami via an
 * external keyboard if one is ever plugged in, page tracking always).
 */

const CommandPaletteProvider = dynamic(
  () => import('@/components/CommandPaletteProvider'),
  { ssr: false, loading: () => null },
);

const ShortcutsOverlayProvider = dynamic(
  () => import('@/components/ShortcutsOverlayProvider'),
  { ssr: false, loading: () => null },
);

const ShortcutsHint = dynamic(
  () => import('@/components/ShortcutsHint'),
  { ssr: false, loading: () => null },
);

// Agent D modules — eager-mounted so visited-page tracking and the konami
// listener are live from the first paint. The toast listener + glance badge
// are also eager-mounted so a sticker earned within the first few seconds
// doesn't silently queue with no UI to display it.
const VisitedPagesTrackerMount = dynamic(
  () => import('@/components/VisitedPagesTrackerMount'),
  { ssr: false, loading: () => null },
);

const KonamiListenerMount = dynamic(
  () => import('@/components/KonamiListenerMount'),
  { ssr: false, loading: () => null },
);

const StickerToastListener = dynamic(
  () => import('@/components/StickerToastListener'),
  { ssr: false, loading: () => null },
);

const StickerGlanceBadge = dynamic(
  () => import('@/components/StickerGlanceBadge'),
  { ssr: false, loading: () => null },
);

// DiscoFlagController is the TINY, eager disco entry point. It only owns the
// data-disco attribute sync + the matrix-event listener. The heavy media tree
// (sparkle canvas, spotlights, audio engine, mute button) lives in a
// completely separate module (`DiscoMediaLayer`) that is fetched via dynamic
// import() ONLY when the user first activates disco. Users who never unlock
// disco never ship the media chunk.
//
// Kept as a dynamic(ssr:false) import so the component's internal useState +
// useEffect don't execute during SSR — but the chunk for the flag controller
// itself is tiny (~sub-kilobyte) and is always needed on the client, so
// Next.js will still include it in the initial bundle.
const DiscoFlagController = dynamic(
  () => import('@/components/DiscoFlagController'),
  { ssr: false, loading: () => null },
);

// SoundRouteListener — plays the page-flip sound on route transitions.
// Kept eager so the first navigation after boot already fires a sound.
const SoundRouteListener = dynamic(
  () => import('@/components/SoundRouteListener'),
  { ssr: false, loading: () => null },
);

// ClickSoundListener — single delegated listener for `data-clickable` ticks.
const ClickSoundListener = dynamic(
  () => import('@/components/ClickSoundListener'),
  { ssr: false, loading: () => null },
);

// SuperuserToastController — sitewide reveal toast mounted globally. The
// controller itself is tiny (reads hasSuperuser + earnedAt + revealedAt via
// narrow hooks) and only dynamically imports the heavy toast body when the
// user actually earns superuser. Users who never unlock pay ~nothing.
const SuperuserToastController = dynamic(
  () => import('@/components/superuser/SuperuserToastController'),
  { ssr: false, loading: () => null },
);

export default function EagerEnhancements() {
  const isDesktop = useDesktopOnly();
  return (
    <>
      <VisitedPagesTrackerMount />
      <KonamiListenerMount />
      <StickerToastListener />
      <StickerGlanceBadge />
      <DiscoFlagController />
      <SoundRouteListener />
      <ClickSoundListener />
      <SuperuserToastController />
      {isDesktop ? <CommandPaletteProvider /> : null}
      {isDesktop ? <ShortcutsOverlayProvider /> : null}
      {isDesktop ? <ShortcutsHint /> : null}
    </>
  );
}
