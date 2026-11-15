import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceAgentPhase } from '@/lib/voiceAgentProtocol';
import VoiceOrb from '@/components/voice/VoiceOrb';
import VoiceStage from '@/components/voice/VoiceStage';

const state = vi.hoisted(() => ({
  reduced: false,
  mobile: false,
  level: 1,
  listeners: new Set<(value: number) => void>(),
  hangup: vi.fn(),
  retry: vi.fn(),
  enableMic: vi.fn(),
  snapshot: {
    hud: 'intro', introComplete: false, phase: 'listening' as VoiceAgentPhase,
    lowNetwork: false, agentLine: '', userLine: '', recovery: 'none',
    exitLine: 'Catch you later.', status: 'Listening', welcomeHint: 'Ask about my work.',
    micLive: true, error: null as string | null, subtitlePhase: 'visible',
  },
}));
vi.mock('@/lib/voiceAudio', () => ({
  getVoicePlaybackLevel: () => state.level,
  subscribeVoicePlaybackLevel: (listener: (value: number) => void) => {
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  },
}));
vi.mock('@/hooks/useEffectiveReducedMotion', () => ({ useEffectiveReducedMotion: () => state.reduced }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsMobile: () => state.mobile }));
vi.mock('@/lib/voiceSessionRuntime', () => ({
  subscribeVoiceSession: () => () => {},
  getVoiceSessionSnapshot: () => state.snapshot,
  getServerVoiceSessionSnapshot: () => state.snapshot,
  requestVoiceHangup: state.hangup,
  retryVoiceSession: state.retry,
  enableVoiceCapture: state.enableMic,
  VOICE_EXIT_VEIL_MS: 1400,
}));

class ElementMock {
  focus = vi.fn();
  style = { transform: '', opacity: '', removeProperty: (key: 'transform' | 'opacity') => { this.style[key] = ''; } };
  getBoundingClientRect = () => ({ x: 100, y: 100, width: 176, height: 176 });
  animate = vi.fn(() => ({ cancel: vi.fn() }));
}

let tree: TestRenderer.ReactTestRenderer;
let frames: Map<number, FrameRequestCallback>;
let frameId: number;
let keys: Map<string, (event: KeyboardEvent) => void>;
let priorFocus: ElementMock;
let now: number;

const mount = (element: React.ReactElement) => act(() => {
  const nodes = new Map<unknown, ElementMock>();
  tree = TestRenderer.create(element, { createNodeMock: ({ props }) => {
    if (!nodes.has(props)) nodes.set(props, new ElementMock());
    return nodes.get(props);
  } });
});
const update = (element: React.ReactElement) => act(() => tree.update(element));
const runFrame = (time: number) => {
  now = time;
  const [id, callback] = [...frames][0]!;
  frames.delete(id);
  act(() => callback(time));
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  frames = new Map();
  frameId = 0;
  now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  keys = new Map();
  priorFocus = new ElementMock();
  vi.stubGlobal('HTMLElement', ElementMock);
  vi.stubGlobal('document', { activeElement: priorFocus });
  vi.stubGlobal('window', {
    addEventListener: (key: string, callback: (event: KeyboardEvent) => void) => keys.set(key, callback),
    removeEventListener: (key: string) => keys.delete(key),
  });
  state.reduced = false;
  state.level = 1;
  state.mobile = false;
  state.snapshot = { ...state.snapshot, hud: 'intro', introComplete: false, phase: 'listening', recovery: 'none', error: null, micLive: true };
  vi.clearAllMocks();
});
afterEach(() => {
  act(() => tree?.unmount());
  expect(frames.size).toBe(0);
  expect(state.listeners.size).toBe(0);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('VoiceOrb', () => {
  it.each(['idle', 'entering', 'connecting', 'listening', 'thinking', 'exiting', 'error'] as VoiceAgentPhase[])('does no level work in %s', phase => {
    mount(React.createElement(VoiceOrb, { phase, reducedMotion: false }));
    expect(frames.size).toBe(0);
    expect(state.listeners.size).toBe(0);
    expect(tree.root.findAllByType('svg')).toHaveLength(1);
    expect(tree.root.findAllByType('img')).toHaveLength(0);
  });

  it.each(['speaking', 'acting'] as const)('smooths %s levels on two compositor properties and cleans up on phase change', phase => {
    mount(React.createElement(VoiceOrb, { phase, reducedMotion: false }));
    expect(state.listeners.size).toBe(1);
    const level = tree.root.findByProps({ className: 'orb-level' }).instance as ElementMock;
    const glow = tree.root.findByProps({ className: 'orb-glow' }).instance as ElementMock;
    runFrame(60);
    const peak = Number(glow.style.opacity);
    expect(peak).toBeGreaterThan(.35);
    expect(peak).toBeLessThan(.85);
    expect(level.style.transform).toMatch(/^scale\(1\./);
    state.listeners.forEach(listener => listener(0));
    runFrame(120);
    expect(Number(glow.style.opacity)).toBeLessThan(peak);
    update(React.createElement(VoiceOrb, { phase: 'listening', reducedMotion: false }));
    expect(level.style.transform).toBe('');
    expect(glow.style.opacity).toBe('');
    expect(frames.size).toBe(0);
    expect(state.listeners.size).toBe(0);
  });

  it('cancels the level loop when reduced motion is enabled during speech', () => {
    mount(React.createElement(VoiceOrb, { phase: 'speaking', reducedMotion: false }));
    runFrame(60);
    update(React.createElement(VoiceOrb, { phase: 'speaking', reducedMotion: true }));
    expect(frames.size).toBe(0);
    expect(state.listeners.size).toBe(0);
  });
});

describe('VoiceStage', () => {
  it.each([false, true])('keeps the exit in its original presentation (introComplete=%s)', introComplete => {
    state.snapshot = { ...state.snapshot, hud: introComplete ? 'live' : 'intro', introComplete };
    mount(React.createElement(VoiceStage));
    state.snapshot = { ...state.snapshot, hud: 'exiting', phase: 'exiting' };
    update(React.createElement(VoiceStage));
    const stage = tree.root.find(node => node.props['data-voice-stage'] === true);
    expect(stage.props['data-veil-from']).toBe(introComplete ? 'live' : 'intro');
    expect(stage.props.role).toBe(introComplete ? 'complementary' : 'dialog');
    expect(tree.root.findAllByProps({ className: 'voice-hero-orb' })).toHaveLength(introComplete ? 0 : 1);
    const farewell = tree.root.find(node => node.type === 'p' && node.children.includes('Catch you later.'));
    if (introComplete) expect(farewell.parent?.props.className).toContain('voice-dock-transcript');
  });

  it('places mobile captions above the safe-area dock and keeps Escape/focus behavior', () => {
    state.mobile = true;
    state.snapshot = { ...state.snapshot, hud: 'live', introComplete: true, agentLine: 'Hello.' };
    mount(React.createElement(VoiceStage));
    const dock = tree.root.find(node => typeof node.props.className === 'string' && node.props.className.startsWith('voice-live-dock'));
    expect(dock.props.style.bottom).toBe('max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))');
    const hangup = tree.root.findByProps({ 'aria-label': 'Hang up voice call' });
    expect((hangup.instance as ElementMock).focus).toHaveBeenCalled();
    const preventDefault = vi.fn();
    keys.get('keydown')?.({ key: 'Escape', preventDefault } as unknown as KeyboardEvent);
    expect(state.hangup).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalled();
    act(() => tree.unmount());
    expect(priorFocus.focus).toHaveBeenCalled();
    expect(keys.size).toBe(0);
  });

  it.each([false, true])('morphs the hero to the dock unless motion is reduced (%s)', reduced => {
    state.reduced = reduced;
    mount(React.createElement(VoiceStage));
    const hero = tree.root.findByProps({ className: 'voice-hero-orb' }).instance as ElementMock;
    hero.getBoundingClientRect = () => ({ x: 200, y: 200, width: 224, height: 224 });
    state.snapshot = { ...state.snapshot, hud: 'live', introComplete: true };
    update(React.createElement(VoiceStage));
    const dock = tree.root.findByType(VoiceOrb).parent!.instance as ElementMock;
    expect(dock.animate).toHaveBeenCalledTimes(reduced ? 0 : 1);
    expect(tree.root.findByProps({ 'aria-label': 'Hang up voice call' }).instance.focus).toHaveBeenCalled();
  });
  it('keeps retry and enable-mic controls usable', () => {
    state.snapshot = { ...state.snapshot, recovery: 'retryable' };
    mount(React.createElement(VoiceStage));
    act(() => tree.root.findAllByType('button').find(button => button.children.includes('Try again'))!.props.onClick());
    expect(state.retry).toHaveBeenCalledOnce();
    state.snapshot = { ...state.snapshot, recovery: 'none', micLive: false, error: 'Microphone blocked' };
    update(React.createElement(VoiceStage));
    act(() => tree.root.findAllByType('button').find(button => button.children.includes('Enable mic'))!.props.onClick());
    expect(state.enableMic).toHaveBeenCalledOnce();
  });
});
