"use client";

import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { requestPageTurnNavigation } from '@/lib/pageTurn';
import { consumeVoiceModeRequest, getVoiceExitReason, useVoiceModeRequest } from '@/lib/voiceModeStore';
import type { VoiceExitReason } from '@/lib/voiceAgentProtocol';

const VoiceStage = dynamic(() => import('@/components/voice/VoiceStage'), {
  ssr: false,
  loading: () => null,
});

export default function VoiceModeController() {
  const request = useVoiceModeRequest();
  const pathname = usePathname();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [exitReason, setExitReason] = useState<VoiceExitReason | null>(null);

  useEffect(() => {
    if (request === 'enter' && !active) {
      consumeVoiceModeRequest();
      if (pathname !== '/chat') {
        requestPageTurnNavigation(router, { href: '/chat', mode: 'push' });
      }
      // Consume the external request once, then mirror it into session state.
      // This cannot be derived after consume() clears the store.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- activate after consume
      setActive(true);
      setReady(false);
      setExitReason(null);
      return;
    }
    if (request === 'exit' && active && exitReason == null) {
      consumeVoiceModeRequest();
      setExitReason(getVoiceExitReason());
    }
  }, [request, active, exitReason, pathname, router]);

  useEffect(() => {
    if (active) document.documentElement.dataset.voiceMode = 'on';
    else delete document.documentElement.dataset.voiceMode;
    return () => {
      delete document.documentElement.dataset.voiceMode;
    };
  }, [active]);

  return (
    <AnimatePresence>
      {active ? (
        <VoiceStage
          requestedExit={exitReason}
          onReady={() => setReady(true)}
          onExitComplete={() => {
            setActive(false);
            setReady(false);
            setExitReason(null);
          }}
        />
      ) : null}
      {active && !ready ? (
        <div className="pointer-events-none fixed inset-0 z-[179] bg-black" aria-hidden />
      ) : null}
    </AnimatePresence>
  );
}
