"use client";

import dynamic from 'next/dynamic';
import { useEffect, useState, type ComponentType } from 'react';
import { useDesktopOnly } from '@/hooks/useDesktopOnly';
import HoverTiltController from '@/components/HoverTiltController';
import VisitedPagesTrackerMount from '@/components/VisitedPagesTrackerMount';
import DiscoFlagController from '@/components/DiscoFlagController';
import SoundRouteListener from '@/components/SoundRouteListener';
import ClickSoundListener from '@/components/ClickSoundListener';
import AdminPrefsController from '@/components/AdminPrefsController';
import ExperimentalFeaturesController from '@/components/ExperimentalFeaturesController';
import VoiceModeController from '@/components/voice/VoiceModeController';

/**
 * EagerEnhancements — a tiny, always-mounted client component that boots the
 * keyboard-driven layer of the site. Unlike `DeferredEnhancements`, these
 * providers must be present before the user's first keystroke, so we don't
 * gate them on `requestIdleCallback`.
 *
 * The shortcuts overlay loads its UI on demand and remains desktop-only.
 * Trackers stay eager on all viewports because they work without a keyboard.
 *
 * Superuser-only asset prefetching lives in `DeferredEnhancements`, so the
 * default path does not subscribe to that store or fetch warmup logic before
 * the page is interactive.
 */

const ShortcutsOverlayProvider = dynamic(
  () => import('@/components/ShortcutsOverlayProvider'),
  { ssr: false, loading: () => null },
);

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
      {isDesktop ? <ShortcutsOverlayProvider /> : null}
      {DesktopContextMenu ? <DesktopContextMenu /> : null}
    </>
  );
}
