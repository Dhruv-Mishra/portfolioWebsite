"use client";

import { useCallback } from 'react';
import { DEFAULT_CHAT_MODEL_ID, isSelectableChatModelId, type ChatModelId } from '@/lib/chatModels';
import { LocalPreference, usePreference } from '@/lib/localPreference';

export const CHAT_MODEL_PREF_STORAGE_KEY = 'chat-model-pref';
export const CHAT_MODEL_SWITCH_CLEAR_EVENT = 'chat-model:switch-clear';

export const CHAT_HISTORY_STORAGE_KEYS = [
  'dhruv-chat-history',
  'dhruv-chat-history:pending',
  'dhruv-chat-suggestions',
] as const;

export function readChatModelPref(value: unknown): ChatModelId {
  return isSelectableChatModelId(value) ? value : DEFAULT_CHAT_MODEL_ID;
}

const chatModelPreference = new LocalPreference<ChatModelId>(CHAT_MODEL_PREF_STORAGE_KEY, readChatModelPref);

export const getChatModelPref = chatModelPreference.get;

export function clearChatHistoryStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of CHAT_HISTORY_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Storage is optional; mounted chat instances still receive the clear event.
  }
}

export function dispatchChatModelSwitchClear(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CHAT_MODEL_SWITCH_CLEAR_EVENT));
}

export function useChatModelPref(): {
  modelId: ChatModelId;
  setModelId: (next: ChatModelId) => void;
} {
  const modelId = usePreference(chatModelPreference);
  const setModelId = useCallback((next: ChatModelId) => {
    if (isSelectableChatModelId(next)) chatModelPreference.set(next);
  }, []);

  return { modelId, setModelId };
}