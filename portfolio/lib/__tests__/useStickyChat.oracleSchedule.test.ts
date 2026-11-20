import React, { useImperativeHandle } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStickyChat } from '@/hooks/useStickyChat';
import { CHAT_STREAM_CONTENT_TYPE } from '@/lib/chatTransport';
import { isInterrogationActive, resetInterrogationState } from '@/lib/matrixChatIntercept';
import { CHAT_CONFIG } from '@/lib/chatContext';
import * as chatModelPref from '@/lib/chatModelPref';
import { generateBrowserChatReply } from '@/lib/browserChatClient';
import { rateLimiter } from '@/lib/rateLimit';

vi.mock('@/lib/browserChatClient', () => ({ generateBrowserChatReply: vi.fn(async () => 'on-device reply') }));

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
  it('reports whether a send was accepted before remote completion', async () => {
    const chatRef = React.createRef<StickyChat>();
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { ref: chatRef }));
    });

    expect(await chatRef.current!.sendMessage('   ')).toBe(false);
    expect(await chatRef.current!.sendMessage('sudo give password')).toBe(true);
    expect(await chatRef.current!.sendMessage('blocked while oracle is busy')).toBe(false);

    await act(async () => renderer.unmount());
  });

  it('rejects rate-limited sends without accepting a user turn', async () => {
    vi.spyOn(rateLimiter, 'check').mockReturnValue(false);
    const chatRef = React.createRef<StickyChat>();
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { ref: chatRef }));
    });

    expect(await chatRef.current!.sendMessage('rate limited')).toBe(false);
    expect(chatRef.current!.messages.filter(message => message.role === 'user')).toHaveLength(0);

    await act(async () => renderer.unmount());
  });

  it('accepts an optimistic user turn even when the provider later fails', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('provider unavailable'));
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });
    const chatRef = React.createRef<StickyChat>();
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { ref: chatRef }));
    });

    let accepted = false;
    await act(async () => {
      accepted = await chatRef.current!.sendMessage('normal request');
    });

    expect(accepted).toBe(true);
    expect(chatRef.current!.messages.findLast(message => message.role === 'user')?.content).toBe('normal request');

    await act(async () => renderer.unmount());
  });

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
    await act(async () => {
      await secondRef.current!.sendMessage('ordinary question after unmount');
    });

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

describe('useStickyChat streamed replies', () => {
  it('keeps streamed text instead of a canned fallback when the stream breaks', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`${JSON.stringify({ type: 'delta', text: 'I spend weekends lifting' })}\n`));
        controller.close();
      },
    });
    const fetchMock = vi.fn<typeof fetch>(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': CHAT_STREAM_CONTENT_TYPE }),
      body,
    }) as Response);
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });
    const chatRef = React.createRef<StickyChat>();
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { ref: chatRef }));
    });
    await act(async () => {
      await chatRef.current!.sendMessage('how do you usually spend your weekends?');
      await vi.runAllTimersAsync();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(chatRef.current!.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'I spend weekends lifting' });

    await act(async () => renderer.unmount());
    vi.unstubAllGlobals();
  });
});

describe('useStickyChat persistence', () => {
  beforeEach(() => { vi.spyOn(rateLimiter, 'check').mockReturnValue(true); });

  async function mountChat() {
    const ref = React.createRef<StickyChat>();
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { ref }));
    });
    return { ref, unmount: async () => { await act(async () => renderer.unmount()); } };
  }

  it('persists a completed reply before removing recovery and survives immediate remount', async () => {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: vi.fn(async () => Response.json({ reply: 'final reply' })) });
    const removeItem = sessionStorage.removeItem.bind(sessionStorage);
    const remove = vi.spyOn(sessionStorage, 'removeItem').mockImplementation(key => {
      if (key.endsWith(':pending')) {
        expect(JSON.parse(localStorage.getItem(CHAT_CONFIG.storageKey)!).at(-1).content).toBe('final reply');
      }
      removeItem(key);
    });
    const first = await mountChat();
    await act(async () => { await first.ref.current!.sendMessage('tell me about your work'); });
    expect(remove).toHaveBeenCalled();
    expect(sessionStorage.getItem(`${CHAT_CONFIG.storageKey}:pending`)).toBeNull();
    await first.unmount();
    const second = await mountChat();
    expect(second.ref.current!.messages.at(-1)).toMatchObject({ content: 'final reply', isOld: true });
    await second.unmount();
  });

  it('flushes a pending debounced message update when unmounted', async () => {
    const chat = await mountChat();
    await act(async () => { chat.ref.current!.sendCanned('open link', 'here is the link', { openUrls: ['https://example.com'] }); });
    const id = chat.ref.current!.messages.at(-1)!.id;
    await act(async () => chat.ref.current!.markOpenUrlsFailed(id));
    expect(JSON.parse(localStorage.getItem(CHAT_CONFIG.storageKey)!).at(-1).openUrlsFailed).toBeUndefined();
    await chat.unmount();
    expect(JSON.parse(localStorage.getItem(CHAT_CONFIG.storageKey)!).at(-1).openUrlsFailed).toBe(true);
  });

  it.each(['denied read', 'denied cleanup'] as const)('runs in memory with %s', async mode => {
    const denied = () => { throw new DOMException('Denied', 'SecurityError'); };
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
      getItem: mode === 'denied read' ? denied : () => '{', setItem: denied, removeItem: denied,
    } });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: denied, setItem: denied, removeItem: denied,
    } });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: vi.fn(async () => Response.json({ reply: 'memory reply' })) });
    const chat = await mountChat();
    await act(async () => { expect(await chat.ref.current!.sendMessage('what do you build?')).toBe(true); });
    expect(chat.ref.current!.messages.at(-1)?.content).toBe('memory reply');
    await act(async () => chat.ref.current!.clearMessages());
    expect(chat.ref.current!.messages).toHaveLength(1);
    await chat.unmount();
  });

  it('adopts a cross-tab history removal without writing cleared messages back', async () => {
    const chat = await mountChat();
    await act(async () => { chat.ref.current!.sendCanned('hello', 'hi'); });
    const save = vi.spyOn(localStorage, 'setItem');
    localStorage.removeItem(CHAT_CONFIG.storageKey);
    const listeners = vi.mocked(window.addEventListener).mock.calls.filter(([name]) => String(name) === 'storage');
    await act(async () => {
      for (const [, listener] of listeners) (listener as (event: Partial<StorageEvent>) => void)({ key: CHAT_CONFIG.storageKey, newValue: null });
      await vi.runAllTimersAsync();
    });
    expect(chat.ref.current!.messages).toHaveLength(1);
    expect(localStorage.getItem(CHAT_CONFIG.storageKey)).toBeNull();
    expect(save).not.toHaveBeenCalled();
    await chat.unmount();
    expect(save).not.toHaveBeenCalled();
  });

  it.each(['server', 'browser'] as const)('preserves local-only provenance and excludes restored oracle notes from %s requests', async target => {
    localStorage.setItem(CHAT_CONFIG.storageKey, JSON.stringify([
      { id: 'oracle-note', role: 'assistant', content: 'local-only puzzle note', timestamp: 1, oracleEmitted: true },
    ]));
    vi.spyOn(chatModelPref, 'getChatModelPref').mockReturnValue(target === 'browser' ? 'on-device' : 'qwen-3.8-27b');
    const fetchMock = vi.fn(async () => Response.json({ reply: 'server reply', suggestions: [] }));
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });
    const chat = await mountChat();
    await act(async () => { await chat.ref.current!.sendMessage('what technologies do you use?'); });
    await act(async () => chat.ref.current!.fetchSuggestions());
    const stored = JSON.parse(localStorage.getItem(CHAT_CONFIG.storageKey)!);
    expect(stored.find((message: { id: string }) => message.id === 'oracle-note').oracleEmitted).toBe(true);
    expect(chat.ref.current!.messages.find(message => message.id === 'oracle-note')?.isOld).toBe(true);
    if (target === 'browser') {
      expect(generateBrowserChatReply).toHaveBeenCalled();
      const history = vi.mocked(generateBrowserChatReply).mock.calls.at(-1)![0];
      expect(history.some(message => message.content === 'local-only puzzle note')).toBe(false);
      expect(history.filter(message => message.role === 'user')).toHaveLength(1);
      expect(history.some(message => !message.content)).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    } else {
      for (const [, init] of vi.mocked(fetchMock as typeof fetch).mock.calls) {
        const body = JSON.parse(init!.body as string);
        expect(body.messages.some((message: { content: string }) => message.content === 'local-only puzzle note')).toBe(false);
        expect(body.messages.filter((message: { role: string }) => message.role === 'user')).toHaveLength(1);
        expect(body.messages.some((message: { content: string }) => !message.content)).toBe(false);
      }
    }
    await chat.unmount();
  });
});
