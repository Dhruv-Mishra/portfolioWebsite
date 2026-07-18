"use client";

import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_CHAT_MODEL_ID, isChatModelId, type ChatModelId } from '@/lib/chatModels';

export const CHAT_MODEL_PREF_STORAGE_KEY = 'chat-model-pref';
export const CHAT_MODEL_PREF_EVENT = 'chat-model-pref:change';
export const CHAT_MODEL_SWITCH_CLEAR_EVENT = 'chat-model:switch-clear';

export const CHAT_HISTORY_STORAGE_KEYS = [
  'dhruv-chat-history',
  'dhruv-chat-history:pending',
  'dhruv-chat-suggestions',
] as const;

export function readChatModelPref(value: unknown): ChatModelId {
  return isChatModelId(value) ? value : DEFAULT_CHAT_MODEL_ID;
}

export function getChatModelPref(): ChatModelId {
  if (typeof window === 'undefined') return DEFAULT_CHAT_MODEL_ID;
  try {
    return readChatModelPref(window.localStorage.getItem(CHAT_MODEL_PREF_STORAGE_KEY));
  } catch {
    return DEFAULT_CHAT_MODEL_ID;
  }
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(CHAT_MODEL_PREF_EVENT, onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener(CHAT_MODEL_PREF_EVENT, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

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
  const modelId = useSyncExternalStore<ChatModelId>(subscribe, getChatModelPref, () => DEFAULT_CHAT_MODEL_ID);

  const setModelId = useCallback((next: ChatModelId) => {
    if (!isChatModelId(next)) return;
    try {
      window.localStorage.setItem(CHAT_MODEL_PREF_STORAGE_KEY, next);
    } catch {
      // Keep the running page usable when storage is unavailable.
    }
    window.dispatchEvent(new Event(CHAT_MODEL_PREF_EVENT));
  }, []);

  return { modelId, setModelId };
}