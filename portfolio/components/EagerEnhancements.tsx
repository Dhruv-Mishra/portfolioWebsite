"use client";

import dynamic from 'next/dynamic';
import { useDesktopOnly } from '@/hooks/useMediaQuery';
import HoverTiltController from '@/components/HoverTiltController';
import VisitedPagesTrackerMount from '@/components/VisitedPagesTrackerMount';
import DiscoFlagController from '@/components/DiscoFlagController';
import SoundRouteListener from '@/components/SoundRouteListener';
import ClickSoundListener from '@/components/ClickSoundListener';
import AdminPrefsController from '@/components/AdminPrefsController';
import ExperimentalFeaturesController from '@/components/ExperimentalFeaturesController';
import VoiceModeController from '@/components/voice/VoiceModeController';

// Controllers that must be live before the first keystroke or click; desktop-only UI loads on demand.
const ShortcutsOverlayProvider = dynamic(() => import('@/components/ShortcutsOverlayProvider'), { ssr: false });
const DesktopContextMenu = dynamic(() => import('@/components/DesktopContextMenu'), { ssr: false });

export default function EagerEnhancements() {
  const isDesktop = useDesktopOnly();

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
      {isDesktop ? (
        <>
          <ShortcutsOverlayProvider />
          <DesktopContextMenu />
        </>
      ) : null}
    </>
  );
}
