"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

export type TtsPlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

interface TtsPlaybackState {
  activeMessageId: string | null;
  error: string | null;
  status: TtsPlaybackStatus;
}

interface UseTtsPlaybackResult extends TtsPlaybackState {
  stop: () => void;
  toggle: (messageId: string, text: string) => Promise<void>;
}

const INITIAL_STATE: TtsPlaybackState = {
  activeMessageId: null,
  error: null,
  status: 'idle',
};

export function useTtsPlayback(): UseTtsPlaybackResult {
  const [state, setState] = useState<TtsPlaybackState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const playbackIdRef = useRef(0);

  const releaseObjectUrl = useCallback(() => {
    if (!objectUrlRef.current) return;
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  const cleanup = useCallback((resetState: boolean) => {
    playbackIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    }

    releaseObjectUrl();
    if (resetState) setState(INITIAL_STATE);
  }, [releaseObjectUrl]);

  const stop = useCallback(() => {
    cleanup(true);
  }, [cleanup]);

  const toggle = useCallback(async (messageId: string, text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    if (state.activeMessageId === messageId && state.status === 'playing') {
      audioRef.current?.pause();
      setState({ activeMessageId: messageId, error: null, status: 'paused' });
      return;
    }

    if (state.activeMessageId === messageId && state.status === 'loading') {
      cleanup(true);
      return;
    }

    if (state.activeMessageId === messageId && state.status === 'paused') {
      try {
        await audioRef.current?.play();
        setState({ activeMessageId: messageId, error: null, status: 'playing' });
      } catch {
        setState({ activeMessageId: messageId, error: 'Could not resume spoken response.', status: 'error' });
      }
      return;
    }

    cleanup(false);
    const abortController = new AbortController();
    abortRef.current = abortController;
    const playbackId = playbackIdRef.current;
    setState({ activeMessageId: messageId, error: null, status: 'loading' });

    try {
      const response = await fetch('/api/tts', {
        body: JSON.stringify({ text: trimmedText }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`TTS request failed with ${response.status}`);
      }

      const audioBlob = await response.blob();
      if (abortController.signal.aborted || playbackIdRef.current !== playbackId) return;

      const objectUrl = URL.createObjectURL(audioBlob);
      objectUrlRef.current = objectUrl;
      const audio = new Audio(objectUrl);
      audioRef.current = audio;

      audio.addEventListener('ended', () => {
        if (playbackIdRef.current !== playbackId || audioRef.current !== audio) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        releaseObjectUrl();
        audioRef.current = null;
        setState(INITIAL_STATE);
      }, { once: true });
      audio.addEventListener('error', () => {
        if (playbackIdRef.current !== playbackId || audioRef.current !== audio) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        releaseObjectUrl();
        audioRef.current = null;
        setState({ activeMessageId: messageId, error: 'Could not play spoken response.', status: 'error' });
      }, { once: true });

      await audio.play();
      if (playbackIdRef.current !== playbackId || audioRef.current !== audio) return;
      setState({ activeMessageId: messageId, error: null, status: 'playing' });
    } catch (error) {
      if (abortController.signal.aborted) return;
      releaseObjectUrl();
      audioRef.current = null;
      setState({
        activeMessageId: messageId,
        error: error instanceof Error ? error.message : 'Could not speak response.',
        status: 'error',
      });
    } finally {
      if (abortRef.current === abortController) {
        abortRef.current = null;
      }
    }
  }, [cleanup, releaseObjectUrl, state.activeMessageId, state.status]);

  useEffect(() => () => {
    cleanup(false);
  }, [cleanup]);

  return {
    ...state,
    stop,
    toggle,
  };
}
