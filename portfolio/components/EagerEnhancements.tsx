"use client";

import dynamic from 'next/dynamic';
import { useDesktopOnly } from '@/hooks/useDesktopOnly';
import CommandPaletteProvider from '@/components/CommandPaletteProvider';

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
 * The lightweight command palette provider mounts on every viewport so chat
 * actions can open its mobile sheet. The shortcuts overlay and hint remain
 * desktop-only keyboard surfaces. Trackers stay eager on all viewports
 * because they work without a keyboard (page tracking always).
 *
 * Superuser-only asset prefetching lives in `DeferredEnhancements`, so the
 * default path does not subscribe to that store or fetch warmup logic before
 * the page is interactive.
 */

const ShortcutsOverlayProvider = dynamic(
  () => import('@/components/ShortcutsOverlayProvider'),
  { ssr: false, loading: () => null },
);

const ShortcutsHint = dynamic(
  () => import('@/components/ShortcutsHint'),
  { ssr: false, loading: () => null },
);

// Agent D tracker — eager-mounted so visited-page tracking is live from the
// first paint. Sticker toasts/badges are deferred; stickerBus buffers early
// earns until the deferred listener lands.
const VisitedPagesTrackerMount = dynamic(
  () => import('@/components/VisitedPagesTrackerMount'),
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

// AdminPrefsController — mirrors admin-prefs store into <html data-pref-*>
// attributes so CSS selectors toggle visual treatments.
const AdminPrefsController = dynamic(
  () => import('@/components/AdminPrefsController'),
  { ssr: false, loading: () => null },
);

const ExperimentalFeaturesController = dynamic(
  () => import('@/components/ExperimentalFeaturesController'),
  { ssr: false, loading: () => null },
);

export default function EagerEnhancements() {
  const isDesktop = useDesktopOnly();
  return (
    <>
      <VisitedPagesTrackerMount />
      <DiscoFlagController />
      <SoundRouteListener />
      <ClickSoundListener />
      <AdminPrefsController />
      <ExperimentalFeaturesController />
      <CommandPaletteProvider />
      {isDesktop ? <ShortcutsOverlayProvider /> : null}
      {isDesktop ? <ShortcutsHint /> : null}
    </>
  );
}
