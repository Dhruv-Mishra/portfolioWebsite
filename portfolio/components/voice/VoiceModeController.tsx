"use client";

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { useDiscoActive } from '@/hooks/useStickers';
import { requestPageTurnNavigation } from '@/lib/pageTurn';
import {
  bindVoiceSessionHost,
  getServerVoiceSessionSnapshot,
  getVoiceSessionSnapshot,
  subscribeVoiceSession,
} from '@/lib/voiceSessionRuntime';

const VoiceStage = dynamic(() => import('@/components/voice/VoiceStage'), {
  ssr: false,
  loading: () => null,
});

export default function VoiceModeController() {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const discoActive = useDiscoActive();
  const snapshot = useSyncExternalStore(
    subscribeVoiceSession,
    getVoiceSessionSnapshot,
    getServerVoiceSessionSnapshot,
  );

  useEffect(() => {
    bindVoiceSessionHost({
      router,
      setTheme: next => setTheme(next),
      resolvedTheme,
      discoActive,
      openFeedback: () => window.dispatchEvent(new CustomEvent('open-feedback')),
      openProject: () => {
        requestPageTurnNavigation(router, { href: '/projects', mode: 'push' });
      },
    });
  }, [discoActive, resolvedTheme, router, setTheme]);

  useEffect(() => {
    if (snapshot.active) {
      document.documentElement.dataset.voiceMode = snapshot.hud === 'live' ? 'live' : 'intro';
    } else {
      delete document.documentElement.dataset.voiceMode;
    }
    window.dispatchEvent(new CustomEvent('voice-mode:change'));
    return () => {
      if (!getVoiceSessionSnapshot().active) {
        delete document.documentElement.dataset.voiceMode;
        window.dispatchEvent(new CustomEvent('voice-mode:change'));
      }
    };
  }, [snapshot.active, snapshot.hud]);

  if (!snapshot.active) return null;
  return <VoiceStage />;
}
