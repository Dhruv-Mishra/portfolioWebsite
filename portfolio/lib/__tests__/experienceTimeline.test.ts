import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExperienceTimeline from '@/components/ExperienceTimeline';
import AboutVoiceLink from '@/components/about/AboutVoiceLink';
import { experienceTimelineEntries } from '@/lib/experienceTimeline';

describe('experience timeline content', () => {
  it('presents the six milestones in the specified order', () => {
    expect(experienceTimelineEntries.map(({ id }) => id)).toEqual([
      'microsoft-current', 'growindigo', 'microsoft-intern',
      'dcll-research', 'competitive-programming', 'iiit-delhi-education',
    ]);
    expect(new Set(experienceTimelineEntries.map(({ id }) => id)).size).toBe(6);
  });

  it.each(experienceTimelineEntries)('keeps a concise impact and full detail for $title', (entry) => {
    expect(entry.impact.length).toBeLessThanOrEqual(90);
    expect(entry.location).not.toBe('');
    expect(entry.highlights.length).toBeGreaterThan(0);
    expect(entry.tools.length).toBeGreaterThan(0);
  });

  it('retains the complete Microsoft achievements and skill set', () => {
    const microsoft = experienceTimelineEntries[0];
    expect(microsoft.highlights).toHaveLength(5);
    expect(microsoft.highlights.join(' ')).toContain('99.99%');
    expect(microsoft.tools).toContain('Jetpack Compose');
  });
});

const feedback = vi.hoisted(() => ({ selection: vi.fn(), toggle: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ useAppHaptics: () => feedback }));
vi.mock('@/lib/voiceModeStore', () => ({ requestVoiceMode: vi.fn() }));

let renderer: TestRenderer.ReactTestRenderer | undefined;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

async function renderTimeline() {
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(ExperienceTimeline, { entries: experienceTimelineEntries }));
  });
  return renderer!;
}

describe('experience timeline interaction', () => {
  it('starts closed and keeps exactly one pin, with toggle feedback', async () => {
    const view = await renderTimeline();
    const buttons = () => view.root.findAllByType('button');
    expect(buttons().every(({ props }) => props['aria-expanded'] === false)).toBe(true);
    await act(async () => buttons()[0].props.onClick());
    expect(buttons()[0].props['aria-expanded']).toBe(true);
    expect(view.root.findAllByProps({ className: 'tl-detail-content font-body' })[0].props.inert).toBe(false);
    await act(async () => buttons()[1].props.onClick());
    expect(buttons().filter(({ props }) => props['aria-expanded'])).toHaveLength(1);
    expect(buttons()[0].props['aria-expanded']).toBe(false);
    expect(buttons()[1].props['aria-expanded']).toBe(true);
    await act(async () => buttons()[1].props.onClick());
    expect(buttons().some(({ props }) => props['aria-expanded'])).toBe(false);
    expect(feedback.selection).toHaveBeenCalledTimes(2);
    expect(feedback.toggle).toHaveBeenCalledOnce();
  });

  it('unpins on Escape inside a pinned tile without swallowing other keys', async () => {
    const view = await renderTimeline();
    const first = () => view.root.findAllByType('button')[0];
    await act(async () => first().props.onClick());
    const tile = () => view.root.findAllByType('article')[0];
    const stopPropagation = vi.fn();
    await act(async () => tile().props.onKeyDown({ key: 'Tab', stopPropagation }));
    expect(first().props['aria-expanded']).toBe(true);
    expect(stopPropagation).not.toHaveBeenCalled();
    await act(async () => tile().props.onKeyDown({ key: 'Escape', stopPropagation }));
    expect(first().props['aria-expanded']).toBe(false);
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it('opens the About voice context through the resume source', async () => {
    const { requestVoiceMode } = await import('@/lib/voiceModeStore');
    await act(async () => { renderer = TestRenderer.create(React.createElement(AboutVoiceLink)); });
    await act(async () => renderer!.root.findByType('button').props.onClick());
    expect(requestVoiceMode).toHaveBeenCalledWith({ source: 'resume', topic: 'about' });
  });
});
