"use client";

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { SkipForward } from 'lucide-react';
import { useAppHaptics } from '@/lib/haptics';
import { soundManager } from '@/lib/soundManager';
import {
  DISCO_TRACKS,
  DiscoPlaybackController,
} from '@/lib/discoPlayback';
import { startDiscoHaptics, stopDiscoHaptics } from '@/lib/discoHaptics';
import { Z_INDEX } from '@/lib/designTokens';
import {
  NEXT_DISCO_TRACK_EVENT,
  attachSiteActionResult,
} from '@/lib/siteActionEvents';
import type { SiteToolResult } from '@/lib/siteTools';

const DiscoSparkleCanvas = dynamic(() => import('./DiscoSparkleCanvas'), { ssr: false, loading: () => null });
const DiscoSpotlights = dynamic(() => import('./DiscoSpotlights'), { ssr: false, loading: () => null });

const DiscoVisuals = memo(function DiscoVisuals(): React.ReactElement {
  return (
    <>
      <DiscoSparkleCanvas />
      <DiscoSpotlights />
    </>
  );
});

const DiscoTrackControl = memo(function DiscoTrackControl(): React.ReactElement {
  const playbackRef = useRef<DiscoPlaybackController | null>(null);
  const uiRequestRef = useRef(0);
  const [track, setTrack] = useState<(typeof DISCO_TRACKS)[number]>(DISCO_TRACKS[0]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    soundManager.warmupSuperuserSounds();
    const playback = new DiscoPlaybackController(soundManager);
    playbackRef.current = playback;
    void playback.start();
    return () => {
      playbackRef.current = null;
      playback.stop();
    };
  }, []);

  const advanceTrack = useCallback((): Promise<SiteToolResult> => {
    const playback = playbackRef.current;
    if (!playback) {
      return Promise.resolve({
        ok: false,
        spokenText: 'Disco track controls are not ready.',
        errorCode: 'disco-track-unavailable',
      });
    }

    const uiRequest = ++uiRequestRef.current;
    const next = playback.next();
    setSwitching(true);
    return next.done.then((didSwitch) => {
      if (uiRequest === uiRequestRef.current && didSwitch) setTrack(next.track);
      if (!didSwitch) {
        return {
          ok: false,
          spokenText: 'I could not skip that disco track.',
          errorCode: 'disco-track-unavailable',
        };
      }
      return {
        ok: true,
        spokenText: `Now playing ${next.track.label}.`,
        data: { track: next.track.label },
      };
    }).finally(() => {
      if (uiRequest === uiRequestRef.current) setSwitching(false);
    });
  }, []);

  useEffect(() => {
    const handler = (raw: Event) => {
      if (raw.defaultPrevented) return;
      attachSiteActionResult(raw, advanceTrack());
    };
    window.addEventListener(NEXT_DISCO_TRACK_EVENT, handler);
    return () => {
      window.removeEventListener(NEXT_DISCO_TRACK_EVENT, handler);
    };
  }, [advanceTrack]);

  const trackNumber = DISCO_TRACKS.indexOf(track) + 1;

  return (
    <div
      data-disco-track-control
      className="fixed bottom-[var(--c-mobile-floating-bottom)] left-[calc(50%-1rem)] -translate-x-1/2 md:bottom-6 md:left-44 md:translate-x-0 flex min-h-11 items-center gap-2 rounded-md border-2 border-dashed border-[var(--c-grid)]/70 bg-[var(--c-paper)]/90 py-1 pl-3 pr-1 shadow-lg backdrop-blur-sm -rotate-1"
      style={{ zIndex: Z_INDEX.nav }}
      role="group"
      aria-label="Disco track controls"
    >
      <div className="min-w-20 font-hand leading-tight text-[var(--c-ink)]" aria-live="polite" aria-busy={switching}>
        <span className="block text-[11px] font-bold opacity-60">{trackNumber} / {DISCO_TRACKS.length}</span>
        <span className="block text-sm font-bold">{switching ? 'Switching...' : track.label}</span>
      </div>
      <button
        type="button"
        onClick={() => { void advanceTrack(); }}
        className="grid size-11 shrink-0 place-items-center rounded text-[var(--c-ink)] transition-colors hover:bg-[var(--c-grid)]/15 active:bg-[var(--c-grid)]/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-highlight)]"
        aria-label={`Next disco track. Current track: ${track.label}`}
        title="Next track"
      >
        <SkipForward size={21} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
});

const DiscoHapticsBridge = memo(function DiscoHapticsBridge(): null {
  const { subtle } = useAppHaptics();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    startDiscoHaptics(subtle);
    return () => {
      stopDiscoHaptics();
    };
  }, [subtle]);

  return null;
});

function DiscoMediaLayerImpl(): React.ReactElement {
  return (
    <>
      <DiscoVisuals />
      <DiscoTrackControl />
      <DiscoHapticsBridge />
    </>
  );
}

export default memo(DiscoMediaLayerImpl);
