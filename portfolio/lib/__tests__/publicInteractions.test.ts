import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Terminal from '@/components/Terminal';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import FeaturedCarousel, { type FeaturedSlide } from '@/components/home/FeaturedCarousel';
import PinBoard, { type BoardNote } from '@/components/about/PinBoard';

vi.mock('next/image', () => ({ default: 'img' }));
vi.mock('next/link', () => ({ default: 'a' }));
vi.mock('next/navigation', () => ({ useRouter: () => ({}) }));
vi.mock('@/context/TerminalContext', () => ({ useTerminal: () => ({ outputLines: [], commandHistory: [], addCommand: vi.fn(), addToHistory: vi.fn(), clearOutput: vi.fn() }) }));
vi.mock('@/lib/haptics', () => ({ lastInputWasKeyboard: () => true, useAppHaptics: () => ({}) }));
vi.mock('@/lib/soundManager', () => ({ soundManager: { play: vi.fn() } }));
vi.mock('@/hooks/useStickers', () => ({ unlockSticker: vi.fn() }));
vi.mock('@/lib/userActionJournal', () => ({ appendUserAction: vi.fn(), isPublicTerminalCommand: () => true }));
vi.mock('@/hooks/useTerminalPlaceholder', () => ({ useTerminalPlaceholder: () => ({ current: null }) }));
vi.mock('@/components/DoodleIcons', () => ({ WindowControls: () => null }));
vi.mock('@/components/TerminalPrompt', () => ({ default: () => null }));
vi.mock('@/components/PillScrollbar', () => ({ default: () => null }));
vi.mock('@/hooks/useEffectiveReducedMotion', () => ({ useEffectiveReducedMotion: () => true }));
vi.mock('@/lib/voiceModeStore', () => ({ requestVoiceMode: vi.fn() }));
vi.mock('@/components/ui/Flyout', () => ({
  useFlyout: () => ({ openId: null, slotRef: () => null }),
  FlyoutClose: () => null,
  FlyoutDialog: () => null,
}));

const renderers: TestRenderer.ReactTestRenderer[] = [];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { href: 'https://whoisdhruv.com/about', hash: '', assign: vi.fn() } }));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible', documentElement: { dataset: {} } }));
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
});
afterEach(async () => {
  for (const renderer of renderers.splice(0)) await act(async () => renderer.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(element: React.ReactElement, createNodeMock: (element: React.ReactElement) => unknown = () => null) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(element, { createNodeMock }); });
  renderers.push(renderer);
  return renderer;
}

describe('terminal keyboard focus', () => {
  it.each(['', 'not-a-command', 'git status', 'resume'])('lets Tab leave when %j cannot complete', async (value) => {
    const view = await render(React.createElement(Terminal));
    const input = () => view.root.findByType('input');
    await act(async () => input().props.onChange({ target: { value } }));
    const preventDefault = vi.fn();
    await act(async () => input().props.onKeyDown({ key: 'Tab', shiftKey: false, preventDefault }));
    expect(preventDefault).not.toHaveBeenCalled();
  });
  it('only captures forward Tab when completing or cycling', async () => {
    const view = await render(React.createElement(Terminal));
    const input = () => view.root.findByType('input');
    await act(async () => input().props.onChange({ target: { value: 'ch' } }));
    const reverse = vi.fn();
    await act(async () => input().props.onKeyDown({ key: 'Tab', shiftKey: true, preventDefault: reverse }));
    expect(reverse).not.toHaveBeenCalled();
    expect(input().props.value).toBe('ch');
    const forward = vi.fn();
    await act(async () => input().props.onKeyDown({ key: 'Tab', shiftKey: false, preventDefault: forward }));
    expect(forward).toHaveBeenCalledOnce();
    expect(input().props.value).toBe('chat');
    await act(async () => input().props.onKeyDown({ key: 'Tab', shiftKey: false, preventDefault: forward }));
    expect(input().props.value).toBe('cheatsheet');
  });
});

it('recovers the root boundary with document navigation even when already on Home', async () => {
  window.location.href = 'https://whoisdhruv.com/';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function Broken(): never { throw new Error('test failure'); }
  const view = await render(React.createElement(ErrorBoundary, null, React.createElement(Broken)));
  view.root.findByType('button').props.onClick();
  expect(window.location.assign).toHaveBeenCalledWith('https://whoisdhruv.com/');
});

it('treats malformed hashes as unknown anchors and still handles subsequent valid hashes', async () => {
  const notes: BoardNote[] = [{ id: 'resume-note', anchor: 'resume', title: 'Resume', paper: 'note', pin: 'red', body: 'Resume text', cta: 'Read', tilt: 0 }];
  window.location.hash = '#%E0%A4%A';
  const view = await render(React.createElement(PinBoard, { notes }));
  const note = () => view.root.findByType('li');
  expect(note().props['data-flagged']).toBeUndefined();
  window.location.hash = '#res%75me';
  await act(async () => { window.dispatchEvent(new Event('hashchange')); });
  expect(note().props['data-flagged']).toBe('');
  window.location.hash = '#%';
  await act(async () => { window.dispatchEvent(new Event('hashchange')); });
  expect(note().props['data-flagged']).toBeUndefined();
});

it('resets cancelled swipes without committing a slide change', async () => {
  const slideNode = { style: { transform: '' }, dataset: {} as Record<string, string> };
  const slides: FeaturedSlide[] = ['one', 'two'].map((slug) => ({ slug, name: slug, summary: slug, stack: 'React', year: '2026', image: '/preview.jpg', blurDataURL: '' }));
  const view = await render(React.createElement(FeaturedCarousel, { slides }), (element) => element.type === 'article' ? slideNode : {});
  const track = () => view.root.find((node) => typeof node.props.onPointerCancel === 'function');
  const activeLabel = () => view.root.findAllByType('article').find((node) => !node.props.inert)!.props['aria-label'];
  const event = (clientX: number, timeStamp: number) => ({ pointerType: 'touch', clientX, clientY: 0, timeStamp, pointerId: 1, currentTarget: { setPointerCapture: vi.fn() } });
  track().props.onPointerDown(event(200, 0));
  track().props.onPointerMove(event(10, 100));
  expect(slideNode.style.transform).not.toBe('');
  await act(async () => track().props.onPointerCancel(event(10, 100)));
  expect(slideNode.style.transform).toBe('');
  expect(slideNode.dataset.dragging).toBeUndefined();
  expect(activeLabel()).toMatch(/^1 of 2/);
  track().props.onPointerDown(event(200, 200));
  track().props.onPointerMove(event(10, 300));
  await act(async () => track().props.onPointerUp(event(10, 300)));
  expect(activeLabel()).toMatch(/^2 of 2/);
});
