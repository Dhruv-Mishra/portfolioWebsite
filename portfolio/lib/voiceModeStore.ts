"use client";

import { useSyncExternalStore } from 'react';
import type { VoiceExitReason } from '@/lib/voiceAgentProtocol';
import {
  parseVoiceInvocationContext,
  type VoiceInvocationContext,
} from '@/lib/voiceClientSnapshot';
import { disposePrimedVoiceAudio, primeVoiceEnterAudio } from '@/lib/voiceAudioActivation';

export type VoiceModeRequest = 'enter' | 'exit';

const EVENT_NAME = 'voice-mode:change';

let requested: VoiceModeRequest | null = null;
let exitReason: VoiceExitReason = 'user';
let pendingContext: VoiceInvocationContext | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, {
      detail: { requested, exitReason },
    }));
  }
}

export function requestVoiceMode(context?: VoiceInvocationContext | unknown): void {
  primeVoiceEnterAudio();
  requested = 'enter';
  pendingContext = parseVoiceInvocationContext(context) ?? null;
  emit();
}

export function requestVoiceModeExit(reason: VoiceExitReason = 'user'): void {
  disposePrimedVoiceAudio();
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

export function consumeVoiceInvocationContext(): VoiceInvocationContext | null {
  const current = pendingContext;
  pendingContext = null;
  return current;
}

export function getVoiceExitReason(): VoiceExitReason {
  return exitReason;
}

export function peekVoiceModeRequest(): VoiceModeRequest | null {
  return requested;
}

export function subscribeVoiceModeBus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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
