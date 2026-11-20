import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VOICE_ORB_TOKENS } from '@/lib/designTokens';
import type { VoiceAgentPhase } from '@/lib/voiceAgentProtocol';
import VoiceOrb from '@/components/voice/VoiceOrb';
import VoiceStage from '@/components/voice/VoiceStage';

const state = vi.hoisted(() => ({
  reduced: false,
  level: 0,
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
vi.mock('@/lib/voiceSessionRuntime', () => ({
  subscribeVoiceSession: () => () => {},
  getVoiceSessionSnapshot: () => state.snapshot,
  getServerVoiceSessionSnapshot: () => state.snapshot,
  requestVoiceHangup: state.hangup,
  retryVoiceSession: state.retry,
  enableVoiceCapture: state.enableMic,
  VOICE_EXIT_VEIL_MS: 1400,
  VOICE_SUBTITLE_FADE_MS: 280,
}));

class ElementMock {
  constructor(readonly insideStage = true) {}
  focus = vi.fn();
  style = { transform: '', opacity: '' };
  animations = [{ updatePlaybackRate: vi.fn() }];
  getAnimations = () => this.animations;
  getBoundingClientRect = () => ({ x: 100, y: 100, width: 64, height: 64 });
  animate = vi.fn(() => ({ cancel: vi.fn() }));
  contains = (node: unknown) => node instanceof ElementMock && node.insideStage;
}

let tree: TestRenderer.ReactTestRenderer;
let mocks: Array<{ props: Record<string, unknown>; node: ElementMock }>;
let frames: Map<number, FrameRequestCallback>;
let frameId: number;
let keys: Map<string, (event: KeyboardEvent) => void>;
let priorFocus: ElementMock;
let now: number;
let doc: { activeElement: unknown };

const mount = (element: React.ReactElement) => act(() => {
  tree = TestRenderer.create(element, { createNodeMock: ({ props }) => {
    const node = new ElementMock();
    mocks.push({ props: props as Record<string, unknown>, node });
    return node;
  } });
});
const update = (element: React.ReactElement) => act(() => tree.update(element));
/** Elements handed to refs, in the order they were attached. */
const refs = (match: (props: Record<string, unknown>) => boolean) => mocks.filter(({ props }) => match(props)).map(({ node }) => node);
const refByClass = (name: string) => refs(props => String(props.className).split(' ').includes(name)).at(-1)!;
const hangupRefs = () => refs(props => props['aria-label'] === 'Hang up voice call');
const runFrame = () => {
  now += 16;
  const [id, callback] = [...frames][0]!;
  frames.delete(id);
  act(() => callback(now));
};
const pressEscape = () => {
  const preventDefault = vi.fn();
  keys.get('keydown')?.({ key: 'Escape', defaultPrevented: false, preventDefault } as unknown as KeyboardEvent);
  return preventDefault;
};
const orb = (phase: VoiceAgentPhase, reducedMotion = false) => React.createElement(VoiceOrb, { phase, reducedMotion });
const stage = () => React.createElement(VoiceStage);
const live = { hud: 'live', introComplete: true } as const;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks = [];
  frames = new Map();
  frameId = 0;
  now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  keys = new Map();
  priorFocus = new ElementMock(false);
  doc = { activeElement: priorFocus };
  vi.stubGlobal('HTMLElement', ElementMock);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', {
    addEventListener: (key: string, callback: (event: KeyboardEvent) => void) => keys.set(key, callback),
    removeEventListener: (key: string) => keys.delete(key),
  });
  state.reduced = false;
  state.level = 0;
  state.snapshot = { ...state.snapshot, hud: 'intro', introComplete: false, phase: 'listening', recovery: 'none', error: null, micLive: true, agentLine: '' };
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
  it.each(['idle', 'connecting', 'listening', 'thinking', 'speaking', 'acting', 'exiting', 'error'] as VoiceAgentPhase[])(
    'does no per-frame work while the agent is silent (%s)',
    phase => {
      mount(orb(phase));
      expect(frames.size).toBe(0);
      expect(tree.root.findAllByType('svg')).toHaveLength(3);
      expect(tree.root.findAllByType('img')).toHaveLength(0);
    },
  );

  it('swells with agent audio on transform and opacity, survives a phase change, and settles to rest', () => {
    state.level = 1;
    mount(orb('speaking'));
    const level = refByClass('orb-level');
    const flare = refByClass('orb-flare');
    runFrame();
    const swell = level.style.transform;
    expect(swell).toMatch(/^scale\(1\.0\d+\)$/);
    expect(Number(flare.style.opacity)).toBeGreaterThan(0);
    expect(Number(flare.style.opacity)).toBeLessThanOrEqual(VOICE_ORB_TOKENS.flareOpacity);

    update(orb('listening'));
    expect(level.style.transform).toBe(swell);
    expect(frames.size).toBe(1);

    state.listeners.forEach(listener => listener(0));
    for (let i = 0; i < 200 && frames.size; i++) runFrame();
    expect(frames.size).toBe(0);
    expect(level.style.transform).toBe('');
    expect(flare.style.opacity).toBe('');

    state.listeners.forEach(listener => listener(0.5));
    expect(frames.size).toBe(1);
    runFrame();
  });

  it('stays static under reduced motion, including when it is enabled mid-speech', () => {
    state.level = 1;
    mount(orb('speaking'));
    runFrame();
    update(orb('speaking', true));
    expect(frames.size).toBe(0);
    expect(state.listeners.size).toBe(0);
    expect(refByClass('orb-level').style.transform).toBe('');
  });

  it('changes ring speed through playbackRate so the rings never restart', () => {
    mount(orb('listening'));
    const [rings] = refByClass('orb-rings').animations;
    expect(rings!.updatePlaybackRate).toHaveBeenLastCalledWith(1);
    update(orb('thinking'));
    expect(rings!.updatePlaybackRate).toHaveBeenLastCalledWith(VOICE_ORB_TOKENS.ringRate.thinking);
    update(orb('acting'));
    expect(rings!.updatePlaybackRate).toHaveBeenLastCalledWith(VOICE_ORB_TOKENS.ringRate.acting);
  });
});

describe('VoiceStage', () => {
  it('opens as a modal intro with focus and Escape wired up', () => {
    mount(stage());
    const root = tree.root.find(node => node.props['data-voice-stage'] === true);
    expect(root.props.role).toBe('dialog');
    expect(tree.root.findByType(VoiceOrb).props.size).toBeUndefined();
    const [chromeHangup] = hangupRefs();
    expect(chromeHangup!.focus).toHaveBeenCalled();
    expect(pressEscape()).toHaveBeenCalled();
    expect(state.hangup).toHaveBeenCalledOnce();
    act(() => tree.unmount());
    expect(priorFocus.focus).toHaveBeenCalled();
    expect(keys.size).toBe(0);
  });

  it.each([false, true])('hands the intro over to the dock (reduced motion: %s)', reduced => {
    state.reduced = reduced;
    mount(stage());
    state.snapshot = { ...state.snapshot, ...live };
    update(stage());
    const orbs = tree.root.findAllByType(VoiceOrb);
    expect(orbs.map(node => node.props.size)).toEqual(['dock']);
    expect(refByClass('voice-dock-orb').animate).toHaveBeenCalledTimes(reduced ? 0 : 1);
    const chrome = tree.root.find(node => typeof node.props.className === 'string' && node.props.className.startsWith('voice-stage-chrome'));
    expect(chrome.props.inert).toBe(true);
    expect(priorFocus.focus).toHaveBeenCalled();
  });

  it('leaves Escape to the page during a live call unless focus is in the dock', () => {
    state.snapshot = { ...state.snapshot, ...live, agentLine: 'Hello.' };
    mount(stage());
    expect(tree.root.find(node => node.props['data-voice-stage'] === true).props.role).toBe('complementary');
    expect(pressEscape()).not.toHaveBeenCalled();
    expect(state.hangup).not.toHaveBeenCalled();
    doc.activeElement = new ElementMock(true);
    expect(pressEscape()).toHaveBeenCalled();
    expect(state.hangup).toHaveBeenCalledOnce();
  });

  it.each([false, true])('keeps an exit in the presentation it started from (introComplete: %s)', introComplete => {
    state.snapshot = { ...state.snapshot, ...(introComplete ? live : {}) };
    mount(stage());
    state.snapshot = { ...state.snapshot, hud: 'exiting', phase: 'exiting' };
    update(stage());
    const root = tree.root.find(node => node.props['data-voice-stage'] === true);
    expect(root.props.role).toBe(introComplete ? 'complementary' : 'dialog');
    expect(tree.root.findByType(VoiceOrb).props.size).toBe(introComplete ? 'dock' : undefined);
    const farewells = tree.root.findAll(node => node.type === 'p' && node.children.includes('Catch you later.'));
    expect(farewells.some(node => node.parent?.props.className.includes('voice-dock-transcript'))).toBe(introComplete);
  });

  it('keeps retry and enable-mic controls usable', () => {
    state.snapshot = { ...state.snapshot, recovery: 'retryable' };
    mount(stage());
    act(() => tree.root.findAllByType('button').find(button => button.children.includes('Try again'))!.props.onClick());
    expect(state.retry).toHaveBeenCalledOnce();
    state.snapshot = { ...state.snapshot, recovery: 'none', micLive: false, error: 'Microphone blocked' };
    update(stage());
    act(() => tree.root.findAllByType('button').find(button => button.children.includes('Enable mic'))!.props.onClick());
    expect(state.enableMic).toHaveBeenCalledOnce();
  });
});
