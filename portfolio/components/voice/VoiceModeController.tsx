"use client";

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { useDiscoActive } from '@/hooks/useStickers';
import { requestPageTurnNavigation } from '@/lib/pageTurn';
import { scheduleVoiceAssetPrefetch } from '@/lib/assetPrefetch';
import { useVoiceModeRequest } from '@/lib/voiceModeStore';

type VoiceSessionRuntime = typeof import('@/lib/voiceSessionRuntime');

interface VoiceControllerSnapshot {
  active: boolean;
  hud: 'idle' | 'intro' | 'live' | 'exiting';
}

const IDLE_SNAPSHOT: VoiceControllerSnapshot = { active: false, hud: 'idle' };

let cachedRuntime: VoiceSessionRuntime | null = null;
let runtimeImport: Promise<VoiceSessionRuntime> | null = null;

function loadVoiceSessionRuntime(): Promise<VoiceSessionRuntime> {
  if (cachedRuntime) return Promise.resolve(cachedRuntime);
  runtimeImport ??= import('@/lib/voiceSessionRuntime')
    .then((mod) => {
      cachedRuntime = mod;
      return mod;
    })
    .catch((error) => {
      runtimeImport = null;
      throw error;
    });
  return runtimeImport;
}

function subscribeIdle(): () => void {
  return () => {};
}

function getIdleSnapshot(): VoiceControllerSnapshot {
  return IDLE_SNAPSHOT;
}

const VoiceStage = dynamic(() => import('@/components/voice/VoiceStage'), {
  ssr: false,
  loading: () => null,
});

export default function VoiceModeController() {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const discoActive = useDiscoActive();
  const request = useVoiceModeRequest();
  const [runtime, setRuntime] = useState<VoiceSessionRuntime | null>(cachedRuntime);
  const snapshot = useSyncExternalStore(
    runtime ? runtime.subscribeVoiceSession : subscribeIdle,
    runtime ? runtime.getVoiceSessionSnapshot : getIdleSnapshot,
    runtime ? runtime.getServerVoiceSessionSnapshot : getIdleSnapshot,
  );

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const shouldRetry = request === 'enter' || cachedRuntime !== null || runtimeImport !== null;

    const tryLoad = () => {
      void loadVoiceSessionRuntime().then((mod) => {
        if (!cancelled) setRuntime(mod);
      }).catch(() => {
        if (cancelled || !shouldRetry || attempts >= 2) return;
        attempts += 1;
        retryTimer = setTimeout(tryLoad, 400);
      });
    };

    tryLoad();
    return () => {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
    };
  }, [request]);

  useEffect(() => {
    if (!runtime) return;
    runtime.bindVoiceSessionHost({
      router,
      setTheme: next => setTheme(next),
      resolvedTheme,
      discoActive,
      openFeedback: () => window.dispatchEvent(new CustomEvent('open-feedback')),
      openProject: (slug) => {
        requestPageTurnNavigation(router, {
          href: slug ? `/projects?project=${encodeURIComponent(slug)}` : '/projects',
          mode: 'push',
        });
      },
    });
  }, [discoActive, resolvedTheme, router, runtime, setTheme]);

  useEffect(() => {
    if (!runtime && !snapshot.active) return;
    scheduleVoiceAssetPrefetch();
  }, [runtime, snapshot.active]);

  useEffect(() => {
    if (!runtime) return;
    if (snapshot.active) {
      document.documentElement.dataset.voiceMode = snapshot.hud === 'live' ? 'live' : 'intro';
    } else {
      delete document.documentElement.dataset.voiceMode;
    }
    window.dispatchEvent(new CustomEvent('voice-mode:change'));
    return () => {
      if (!runtime.getVoiceSessionSnapshot().active) {
        delete document.documentElement.dataset.voiceMode;
        window.dispatchEvent(new CustomEvent('voice-mode:change'));
      }
    };
  }, [runtime, snapshot.active, snapshot.hud]);

  if (!snapshot.active) return null;
  return <VoiceStage />;
}
