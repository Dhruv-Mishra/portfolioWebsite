"use client";

import { AudioLines } from 'lucide-react';
import { NoteFace } from '@/components/home/NoteFace';
import { requestVoiceMode } from '@/lib/voiceModeStore';
import type { VoiceInvocationContext } from '@/lib/voiceInvocation';
import { cn } from '@/lib/utils';

interface HomeVoiceNoteProps {
  label?: string;
  srHint?: string;
  context?: VoiceInvocationContext;
  className?: string;
}

export default function HomeVoiceNote({
  label = 'Talk to AI Dhruv',
  srHint = 'starts a voice call with an AI version of Dhruv',
  context,
  className,
}: HomeVoiceNoteProps) {
  return (
    <button
      type="button"
      data-clickable
      data-hover-tilt
      data-voice-launcher
      data-disco-motion="wiggle"
      className={cn('group relative inline-block text-left focus-ring', className)}
      onClick={() => requestVoiceMode(context)}
    >
      <NoteFace icon={AudioLines} label={label} tone="blue" className="-rotate-1" />
      <span className="sr-only">, {srHint}</span>
    </button>
  );
}
