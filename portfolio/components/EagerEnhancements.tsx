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

export default function EagerEnhancements() {
  const isDesktop = useDesktopOnly();
  return (
    <>
      <VisitedPagesTrackerMount />
      <KonamiListenerMount />
      <StickerToastListener />
      <StickerGlanceBadge />
      {isDesktop ? <CommandPaletteProvider /> : null}
      {isDesktop ? <ShortcutsOverlayProvider /> : null}
      {isDesktop ? <ShortcutsHint /> : null}
    </>
  );
}
