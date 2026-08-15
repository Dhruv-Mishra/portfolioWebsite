"use client";

import { useSyncExternalStore } from 'react';
import type { VoiceExitReason } from '@/lib/voiceAgentProtocol';

export type VoiceModeRequest = 'enter' | 'exit';

const EVENT_NAME = 'voice-mode:change';

let requested: VoiceModeRequest | null = null;
let exitReason: VoiceExitReason = 'user';
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, {
      detail: { requested, exitReason },
    }));
  }
}

export function requestVoiceMode(): void {
  requested = 'enter';
  emit();
}

export function requestVoiceModeExit(reason: VoiceExitReason = 'user'): void {
  requested = 'exit';
  exitReason = reason;
  emit();
}

export function consumeVoiceModeRequest(): VoiceModeRequest | null {
  const current = requested;
  requested = null;
  emit();
  return current;
}

export function getVoiceExitReason(): VoiceExitReason {
  return exitReason;
}

export function useVoiceModeRequest(): VoiceModeRequest | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => requested,
    () => null,
  );
}
