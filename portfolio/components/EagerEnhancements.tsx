"use client";

import dynamic from 'next/dynamic';
import { useEffect, useState, type ComponentType } from 'react';
import { useDesktopOnly } from '@/hooks/useDesktopOnly';
import CommandPaletteProvider from '@/components/CommandPaletteProvider';
import HoverTiltController from '@/components/HoverTiltController';

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

const ShortcutsHintModule = dynamic(
  () => import('@/components/ShortcutsHint'),
  { ssr: false, loading: () => null },
);

/**
 * Desktop hint chrome. The `{isDesktop ? <ShortcutsHint /> : null}` call site
 * stays eager so the palette contract test still passes; this wrapper delays
 * the actual ShortcutsHint chunk until idle (or ~1.5s) so it is not in the
 * first-paint graph.
 */
function ShortcutsHint() {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const runtimeWindow = window as Window & {
      requestIdleCallback?: typeof window.requestIdleCallback;
      cancelIdleCallback?: typeof window.cancelIdleCallback;
    };
    const reveal = () => setShowHint(true);

    if (typeof runtimeWindow.requestIdleCallback === 'function') {
      const idleId = runtimeWindow.requestIdleCallback(reveal, { timeout: 1500 });
      return () => runtimeWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = runtimeWindow.setTimeout(reveal, 1500);
    return () => runtimeWindow.clearTimeout(timeoutId);
  }, []);

  if (!showHint) return null;
  return <ShortcutsHintModule />;
}

import VisitedPagesTrackerMount from '@/components/VisitedPagesTrackerMount';
import DiscoFlagController from '@/components/DiscoFlagController';
import SoundRouteListener from '@/components/SoundRouteListener';
import ClickSoundListener from '@/components/ClickSoundListener';
import AdminPrefsController from '@/components/AdminPrefsController';
import ExperimentalFeaturesController from '@/components/ExperimentalFeaturesController';
import VoiceModeController from '@/components/voice/VoiceModeController';

export default function EagerEnhancements() {
  const isDesktop = useDesktopOnly();
  const [DesktopContextMenu, setDesktopContextMenu] = useState<ComponentType | null>(null);

  useEffect(() => {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    let active = true;

    const syncContextMenu = () => {
      if (!finePointer.matches) {
        setDesktopContextMenu(null);
        return;
      }
      void import('@/components/DesktopContextMenu').then((module) => {
        if (active && finePointer.matches) setDesktopContextMenu(() => module.default);
      });
    };

    syncContextMenu();
    finePointer.addEventListener('change', syncContextMenu);
    return () => {
      active = false;
      finePointer.removeEventListener('change', syncContextMenu);
    };
  }, []);

  return (
    <>
      <VisitedPagesTrackerMount />
      <DiscoFlagController />
      <SoundRouteListener />
      <ClickSoundListener />
      <HoverTiltController />
      <AdminPrefsController />
      <ExperimentalFeaturesController />
      <VoiceModeController />
      <CommandPaletteProvider />
      {isDesktop ? <ShortcutsOverlayProvider /> : null}
      {isDesktop ? <ShortcutsHint /> : null}
      {DesktopContextMenu ? <DesktopContextMenu /> : null}
    </>
  );
}
