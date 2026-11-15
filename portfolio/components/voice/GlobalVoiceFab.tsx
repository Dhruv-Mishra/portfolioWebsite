'use client';

import { usePathname } from 'next/navigation';
import { AudioLines } from 'lucide-react';
import { requestVoiceMode } from '@/lib/voiceModeStore';
import { topicFromPath } from '@/lib/voiceInvocation';

/** "Talk to AI Dhruv" launcher shared by the desktop rail and the mobile dock; each passes its own look. */
export default function GlobalVoiceFab({ className, iconSize = 22 }: { className?: string; iconSize?: number }) {
  const pathname = usePathname();
  return (
    <button
      type="button"
      onClick={() => requestVoiceMode({ source: 'nav', topic: topicFromPath(pathname) })}
      data-global-voice-fab
      data-voice-launcher
      aria-label="Talk to AI Dhruv"
      className={className}
    >
      <AudioLines size={iconSize} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}
