"use client";

import { requestVoiceMode } from '@/lib/voiceModeStore';

export default function AboutVoiceLink() {
  return (
    <button
      type="button"
      className="about-link focus-ring inline-flex min-h-11 items-center font-hand text-[length:var(--t-hand-sm)]"
      onClick={() => requestVoiceMode({ source: 'resume', topic: 'about' })}
    >
      Talk to AI Dhruv
    </button>
  );
}
