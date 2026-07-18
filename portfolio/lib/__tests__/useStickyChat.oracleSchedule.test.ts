import React, { useImperativeHandle } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStickyChat } from '@/hooks/useStickyChat';
import { isInterrogationActive, resetInterrogationState } from '@/lib/matrixChatIntercept';

type StickyChat = ReturnType<typeof useStickyChat>;

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;
const originalSessionStorage = globalThis.sessionStorage;
const originalFetch = globalThis.fetch;

const Harness = React.forwardRef<StickyChat>(function Harness(_, ref) {
  const chat = useStickyChat();
  useImperativeHandle(ref, () => chat, [chat]);
  return null;
});

function createResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

function abortError() {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: new MemoryStorage() });
  resetInterrogationState();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetInterrogationState();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalLocalStorage });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: originalSessionStorage });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('useStickyChat oracle schedule ownership', () => {
  it('blocks regular sends through the filler and answer pause, then clear releases a normal send', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(createResponse({ reply: 'normal reply' }));
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });
    const chatRef = React.createRef<StickyChat>();
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { ref: chatRef }));
    });

    await act(async () => {
      await chatRef.current!.sendMessage('sudo give password');
      await chatRef.current!.sendMessage('ordinary question during filler');
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.runAllTimers();
    });
    expect(chatRef.current!.isLoading).toBe(false);

    await act(async () => {
      await chatRef.current!.sendMessage('yes');
      await chatRef.current!.sendMessage('ordinary question during answer pause');
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      chatRef.current!.clearMessages();
      await chatRef.current!.sendMessage('ordinary question after clear');
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    await act(async () => renderer.unmount());
  });

  it('resets an armed interrogation when the hook unmounts', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(createResponse({ reply: 'normal reply' }));
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });
    const firstRef = React.createRef<StickyChat>();
    let firstRenderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      firstRenderer = TestRenderer.create(React.createElement(Harness, { ref: firstRef }));
    });
    await act(async () => {
      await firstRef.current!.sendMessage('sudo give password');
      vi.runAllTimers();
    });
    await act(async () => firstRenderer.unmount());

    const secondRef = React.createRef<StickyChat>();
    let secondRenderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      secondRenderer = TestRenderer.create(React.createElement(Harness, { ref: secondRef }));
    });
    await act(async () => secondRef.current!.sendMessage('ordinary question after unmount'));

    expect(fetchMock).toHaveBeenCalledOnce();
    await act(async () => secondRenderer.unmount());
  });

  it('declines canned replies while an interrogation is armed so the answer reaches the oracle', async () => {
    const chatRef = React.createRef<StickyChat>();
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { ref: chatRef }));
    });
    await act(async () => {
      await chatRef.current!.sendMessage('sudo give password');
      vi.runAllTimers();
    });
    expect(isInterrogationActive()).toBe(true);

    const messagesBeforeCannedAttempt = chatRef.current!.messages;
    expect(chatRef.current!.sendHardcoded('yes', 'canned reply')).toBe(false);
    expect(chatRef.current!.messages).toEqual(messagesBeforeCannedAttempt);

    await act(async () => {
      await chatRef.current!.sendMessage('yes');
    });
    expect(chatRef.current!.messages).toHaveLength(messagesBeforeCannedAttempt.length + 1);
    expect(chatRef.current!.messages.at(-1)?.content).toBe('yes');

    await act(async () => renderer.unmount());
  });
});

describe('useStickyChat suggestion controller finalization', () => {
  it('clears loading for a timed-out current request but not a superseded request', async () => {
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      (init?.signal as AbortSignal).addEventListener('abort', () => reject(abortError()));
    }));
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });
    const chatRef = React.createRef<StickyChat>();
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { ref: chatRef }));
    });
    await act(async () => {
      chatRef.current!.sendCanned('context', 'reply');
    });

    act(() => chatRef.current!.fetchSuggestions());
    act(() => chatRef.current!.fetchSuggestions());
    expect(chatRef.current!.isSuggestionsLoading).toBe(true);

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(chatRef.current!.isSuggestionsLoading).toBe(false);

    await act(async () => renderer.unmount());
  });
});