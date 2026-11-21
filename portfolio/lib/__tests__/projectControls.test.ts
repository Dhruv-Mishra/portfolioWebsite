import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectGridController from '@/components/ProjectGridController';
import ProjectModal from '@/components/ProjectModal';
import { requestOpenProject } from '@/lib/siteActionEvents';
import type { ProjectRecord } from '@/lib/projects';

const { reduced } = vi.hoisted(() => ({ reduced: { value: true } }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URL(React.useSyncExternalStore(subscribeToRouter, () => routerUrl)).searchParams,
}));
vi.mock('next/dynamic', () => ({ default: () => function Dialog(props: Record<string, unknown>) { return React.createElement('dialog', props); } }));
vi.mock('next/image', () => ({ default: 'img' }));
vi.mock('framer-motion', () => ({ usePresence: () => [true, vi.fn()] }));
vi.mock('@/components/ui/Modal', () => ({ Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => isOpen ? children : null }));
vi.mock('@/components/ui/MarkedText', () => ({ MarkedText: ({ text }: { text: string }) => text }));
vi.mock('@/components/MediaCarousel', () => ({ default: ({ slides }: { slides: { key: string; content: React.ReactNode }[] }) => slides.map((slide) => React.createElement(React.Fragment, { key: slide.key }, slide.content)) }));
vi.mock('@/hooks/useEffectiveReducedMotion', () => ({ useEffectiveReducedMotion: () => reduced.value }));
vi.mock('@/hooks/useSitePrefs', () => ({ useSitePrefs: () => ({ noteFlight: 'fade' }) }));
vi.mock('@/hooks/useStickers', () => ({ unlockSticker: vi.fn(), useMasterVolume: () => 0.5, useSoundsMuted: () => false }));
vi.mock('@/lib/haptics', () => ({ useAppHaptics: () => ({ closePanel: vi.fn(), openPanel: vi.fn(), selection: vi.fn(), tap: vi.fn() }) }));
vi.mock('@/lib/fasteners', () => ({ release: vi.fn(), reset: vi.fn(), secure: vi.fn(), shownFastener: vi.fn() }));
vi.mock('@/lib/quietFocus', () => ({ moveFocus: vi.fn() }));
vi.mock('@/lib/userActionJournal', () => ({ appendUserAction: vi.fn() }));
vi.mock('@/lib/projects', () => ({ getProjectThumbnail: () => '/poster.jpg', getProjectVideoSources: () => [{ src: '/preview.mp4', type: 'video/mp4' }] }));

const renderers: TestRenderer.ReactTestRenderer[] = [];
let location: { href: string };
let routerUrl: string;
function subscribeToRouter(cb: () => void) {
  window.addEventListener('routechange', cb);
  return () => window.removeEventListener('routechange', cb);
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  reduced.value = true;
  location = { href: 'https://whoisdhruv.com/projects?tag=web' };
  routerUrl = location.href;
  function notifyRouter() {
    routerUrl = location.href;
    window.dispatchEvent(new Event('routechange'));
  }
  const entries = [
    { url: 'https://whoisdhruv.com/about', state: { __NA: true, next: 'earlier' } },
    { url: location.href, state: { __NA: true, next: 'keep-me' } },
  ];
  let index = 1;
  const history = {
    get state() { return entries[index].state; },
    pushState: vi.fn((state, _unused, url) => {
      entries.splice(++index);
      entries.push({ state: { ...state, __NA: true }, url: String(url) });
      location.href = String(url);
      if (!state?.__NA && !state?._N) notifyRouter();
    }),
    replaceState: vi.fn((state, _unused, url) => {
      entries[index] = { state: { ...state, __NA: true }, url: String(url) };
      location.href = String(url);
      if (!state?.__NA && !state?._N) notifyRouter();
    }),
    back: vi.fn(() => { if (index > 0) { location.href = entries[--index].url; notifyRouter(); } }),
    forward: vi.fn(() => { if (index + 1 < entries.length) { location.href = entries[++index].url; notifyRouter(); } }),
  };
  const body = {};
  vi.stubGlobal('window', Object.assign(new EventTarget(), { location, history, requestAnimationFrame: vi.fn() }));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { body, activeElement: body, querySelector: () => null }));
});
afterEach(async () => {
  for (const renderer of renderers.splice(0)) await act(async () => renderer.unmount());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function render(element: React.ReactElement, createNodeMock: (element: React.ReactElement) => unknown = () => null) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(element, { createNodeMock }); });
  renderers.push(renderer);
  return renderer;
}

describe('project history ownership', () => {
  it('opens on the first tile click and follows Back and Forward without a refresh', async () => {
    const view = await render(React.createElement(ProjectGridController));
    const click = Object.defineProperties(new Event('click', { cancelable: true }), {
      button: { value: 0 }, target: { value: { closest: () => ({ dataset: { projectSlug: 'invoke' } }) } },
    });
    await act(async () => { document.dispatchEvent(click); });
    const open = () => view.root.findByType('dialog').props.projectSlug;
    expect(click.defaultPrevented).toBe(true);
    expect(open()).toBe('invoke');
    expect(new URL(location.href).searchParams.get('tag')).toBe('web');
    expect(window.history.state.next).toBe('keep-me');
    await act(async () => window.history.back());
    expect(open()).toBeNull();
    await act(async () => window.history.forward());
    expect(open()).toBe('invoke');
    await act(async () => view.root.findByType('dialog').props.onClose());
    expect(open()).toBeNull();
    expect(location.href).toBe('https://whoisdhruv.com/projects?tag=web');
    await act(async () => window.history.back());
    expect(location.href).toBe('https://whoisdhruv.com/about');
  });

  it('replaces deep links on Close without losing unrelated query or history state', async () => {
    window.history.replaceState({ next: 'preserved' }, '', 'https://whoisdhruv.com/projects?tag=web&project=invoke#wall');
    const view = await render(React.createElement(ProjectGridController));
    await act(async () => { requestOpenProject('cropio'); });
    expect(view.root.findByType('dialog').props.projectSlug).toBe('cropio');
    await act(async () => view.root.findByType('dialog').props.onClose());
    expect(window.history.back).not.toHaveBeenCalled();
    expect(location.href).toBe('https://whoisdhruv.com/projects?tag=web#wall');
    expect(view.root.findByType('dialog').props.projectSlug).toBeNull();
    expect(window.history.state.next).toBe('preserved');
  });
});

it('offers persistent media controls synced to actual play/pause events without reduced-motion autoplay', async () => {
  const project = {
    slug: 'invoke', name: 'Invoke', role: 'Engineer', year: '2026', duration: 'Ongoing',
    image: '/poster.jpg', accent: 'blue', details: 'Project details', highlights: [], stack: [], link: 'https://github.com/example',
  } as unknown as ProjectRecord;
  const media = { paused: true, muted: true, volume: 0.5, play: vi.fn(async () => { media.paused = false; }), pause: vi.fn(() => { media.paused = true; }) };
  const view = await render(React.createElement(ProjectModal, { project, onClose: vi.fn() }), (element) => element.type === 'video' ? media : null);
  const button = (label: string) => view.root.findByProps({ 'aria-label': label });
  expect(media.play).not.toHaveBeenCalled();
  await act(async () => button('Play preview video').props.onClick());
  await act(async () => view.root.findByType('video').props.onPlay());
  expect(media.play).toHaveBeenCalledOnce();
  expect(button('Pause preview video')).toBeDefined();
  expect(button('Unmute video')).toBeDefined();
  await act(async () => button('Pause preview video').props.onClick());
  await act(async () => view.root.findByType('video').props.onPause());
  expect(media.pause).toHaveBeenCalledOnce();
  expect(button('Play preview video')).toBeDefined();
  await act(async () => view.root.findByType('video').props.onPlay());
  expect(button('Pause preview video')).toBeDefined();
});
