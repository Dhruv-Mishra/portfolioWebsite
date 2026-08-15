"use client";

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { consumeVoiceModeRequest, getVoiceExitReason, useVoiceModeRequest } from '@/lib/voiceModeStore';
import type { VoiceExitReason } from '@/lib/voiceAgentProtocol';

const VoiceStage = dynamic(() => import('@/components/voice/VoiceStage'), {
  ssr: false,
  loading: () => null,
});

export default function VoiceModeController() {
  const request = useVoiceModeRequest();
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [exitReason, setExitReason] = useState<VoiceExitReason | null>(null);

  if (request === 'enter' && !active) {
    consumeVoiceModeRequest();
    setActive(true);
    setReady(false);
    setExitReason(null);
  } else if (request === 'exit' && active && exitReason == null) {
    consumeVoiceModeRequest();
    setExitReason(getVoiceExitReason());
  }

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
