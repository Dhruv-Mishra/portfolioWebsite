import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GuestbookForm from '@/components/GuestbookForm';
import FeedbackNote from '@/components/FeedbackNote';
import { TIMING_TOKENS } from '@/lib/designTokens';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/guestbook' }));
vi.mock('@/components/motion/requestMotion', () => ({ requestMotion: vi.fn() }));
vi.mock('framer-motion', async () => {
  const { createElement, forwardRef } = await import('react');
  const tags = new Map();
  return {
    m: new Proxy({}, { get: (_, tag: string) => {
      if (!tags.has(tag)) tags.set(tag, forwardRef((props: Record<string, unknown>, ref) => createElement(tag, { ...props, ref })));
      return tags.get(tag);
    } }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});
vi.mock('@/components/ui/Modal', () => ({ Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => isOpen ? children : null }));
vi.mock('@/components/ui/TapeStrip', () => ({ TapeStrip: () => null }));
vi.mock('@/components/ui/WavyUnderline', () => ({ WavyUnderline: () => null }));
vi.mock('@/components/ui/MicButton', () => ({ MicButton: () => null }));
vi.mock('@/components/ui/VoiceBackendToggle', () => ({ VoiceBackendToggle: () => null }));
vi.mock('@/components/ui/ClearButton', () => ({ ClearButton: () => null }));
vi.mock('@/components/ui/ListeningOverlay', () => ({ ListeningOverlay: () => null }));
vi.mock('@/lib/voiceBackendPref', () => ({ useVoiceBackendPref: () => ({ pref: 'browser', setPref: vi.fn() }) }));
vi.mock('@/hooks/useVoiceInput', () => {
  const speech = { reset: vi.fn(), stop: vi.fn(), start: vi.fn(), isListening: false, isSupported: false };
  return { useVoiceInput: () => speech };
});
vi.mock('@/lib/haptics', () => {
  const haptics = Object.fromEntries(['clear', 'closePanel', 'error', 'selection', 'submit', 'success', 'warning'].map((key) => [key, vi.fn()]));
  return { useAppHaptics: () => haptics };
});
vi.mock('@/lib/soundManager', () => ({ soundManager: { play: vi.fn() } }));
vi.mock('@/hooks/useStickers', () => ({ unlockSticker: vi.fn() }));
vi.mock('@/lib/userActionJournal', () => ({ appendUserAction: vi.fn() }));
vi.mock('@/lib/rateLimit', () => ({ rateLimiter: { check: () => true }, RATE_LIMITS: { FEEDBACK: {} } }));

const fetchMock = vi.fn<typeof fetch>();
const renderers: TestRenderer.ReactTestRenderer[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: storage }));
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockResolvedValue(Response.json({ success: true }));
});
afterEach(async () => {
  for (const renderer of renderers.splice(0)) await act(async () => renderer.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function render(element: React.ReactElement, createNodeMock: (element: React.ReactElement) => unknown = () => null) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(element, { createNodeMock }); });
  renderers.push(renderer);
  return renderer;
}

describe('guestbook field validation', () => {
  it('associates the validation error with and focuses the failing field', async () => {
    const messageFocus = vi.fn();
    const nameFocus = vi.fn();
    const renderer = await render(React.createElement(GuestbookForm), (element) => {
      if (element.type === 'textarea') return { focus: messageFocus, style: {}, scrollHeight: 100 };
      if ((element.props as { id?: string }).id === 'guestbook-name') return { focus: nameFocus };
      return null;
    });
    const message = () => renderer.root.findByType('textarea');
    const name = () => renderer.root.findByProps({ id: 'guestbook-name' });
    const submit = () => renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() });

    await act(async () => { await submit(); });
    expect(messageFocus).toHaveBeenCalledOnce();
    expect(message().props['aria-invalid']).toBe('true');
    expect(message().props['aria-describedby']).toBe(renderer.root.findByProps({ role: 'alert' }).props.id);
    expect(name().props['aria-invalid']).toBeUndefined();

    await act(async () => {
      message().props.onChange({ target: { value: 'A valid guestbook note' } });
      name().props.onChange({ target: { value: 'A' } });
    });
    await act(async () => { await submit(); });
    expect(nameFocus).toHaveBeenCalledOnce();
    expect(name().props['aria-invalid']).toBe('true');
    expect(name().props['aria-describedby']).toBe(renderer.root.findByProps({ role: 'alert' }).props.id);
    expect(message().props['aria-invalid']).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => name().props.onChange({ target: { value: 'Visitor' } }));
    expect(name().props['aria-invalid']).toBeUndefined();
  });
});

describe('feedback lifecycle and disclosure', () => {
  async function opened(onClose = vi.fn()) {
    const renderer = await render(React.createElement(FeedbackNote, { isOpen: true, onClose }));
    await act(async () => renderer.root.findByType('textarea').props.onChange({ target: { value: 'A helpful idea' } }));
    return { renderer, onClose };
  }
  async function send(renderer: TestRenderer.ReactTestRenderer) {
    await act(async () => { await renderer.root.findAllByType('button').find((button) => button.children.includes('Send'))!.props.onClick(); });
  }

  it('discloses public feedback and does not transmit browser fingerprint fields', async () => {
    const { renderer } = await opened();
    const contact = renderer.root.findByProps({ id: 'feedback-contact' });
    expect(renderer.root.findByType('label').children.join('')).toMatch(/optional, public/i);
    expect(renderer.root.findByProps({ id: contact.props['aria-describedby'] }).children.join('')).toMatch(/publicly on GitHub/);
    await act(async () => contact.props.onChange({ target: { value: '@visitor' } }));
    await send(renderer);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ category: 'bug', message: 'A helpful idea', contact: '@visitor', page: '/guestbook' });
  });

  it.each(['dismiss', 'external close'] as const)('does not close a reopened note after %s', async (method) => {
    const { renderer, onClose } = await opened();
    await send(renderer);
    if (method === 'dismiss') await act(async () => renderer.root.findByProps({ 'aria-label': 'Close feedback note' }).props.onClick());
    await act(async () => renderer.update(React.createElement(FeedbackNote, { isOpen: false, onClose })));
    await act(async () => renderer.update(React.createElement(FeedbackNote, { isOpen: true, onClose })));
    onClose.mockClear();
    await act(async () => { await vi.advanceTimersByTimeAsync(TIMING_TOKENS.successAutoClose + TIMING_TOKENS.closeResetDelay + 1); });
    expect(onClose).not.toHaveBeenCalled();
    expect(renderer.root.findByType('textarea')).toBeDefined();
  });

  it('clears success timers on unmount', async () => {
    const { renderer, onClose } = await opened();
    await send(renderer);
    await act(async () => renderer.unmount());
    renderers.splice(renderers.indexOf(renderer), 1);
    await act(async () => { await vi.advanceTimersByTimeAsync(TIMING_TOKENS.successAutoClose + 1); });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a recoverable timeout error without clearing the visitor draft', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'Feedback service timed out. Please try again later.' }, { status: 504 }));
    const { renderer } = await opened();
    await send(renderer);
    expect(renderer.root.findAllByType('p').find((node) => node.props.role === 'alert')!.children.join('')).toMatch(/try again later/i);
    expect(renderer.root.findByType('textarea').props.value).toBe('A helpful idea');
  });
});
