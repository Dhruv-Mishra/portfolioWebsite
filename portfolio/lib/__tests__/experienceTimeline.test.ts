import fs from 'node:fs';
import path from 'node:path';
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

  it('gives every company entry a logo that ships in public/', () => {
    for (const entry of experienceTimelineEntries) {
      if (entry.category === 'achievement') continue;
      expect(entry.logo, entry.id).toMatch(/^\/resources\/logos\/[\w-]+\.(svg|webp)$/);
      expect(fs.existsSync(path.join(process.cwd(), 'public', entry.logo!)), entry.logo).toBe(true);
    }
  });
});

const feedback = vi.hoisted(() => ({ selection: vi.fn(), toggle: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ useAppHaptics: () => feedback }));
vi.mock('@/lib/voiceModeStore', () => ({ requestVoiceMode: vi.fn() }));

let renderer: TestRenderer.ReactTestRenderer | undefined;
// The timeline listens on document for clicks outside an open card; an EventTarget is all it needs.
const page = new EventTarget();
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: page });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

async function renderTimeline() {
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(ExperienceTimeline));
  });
  const root = renderer!.root;
  const triggers = () => root.findAll((node) => node.type === 'button' && node.props['aria-controls'] !== undefined);
  const sheet = (trigger: TestRenderer.ReactTestInstance) => root.find((node) => node.props.id === trigger.props['aria-controls'] && node.type === 'div');
  const item = (trigger: TestRenderer.ReactTestInstance) => trigger.parent!;
  return { triggers, sheet, item };
}

describe('experience timeline interaction', () => {
  it('names each tile by its title and points it at an inert, collapsed sheet', async () => {
    const { triggers, sheet } = await renderTimeline();
    expect(triggers()).toHaveLength(experienceTimelineEntries.length);
    for (const [index, trigger] of triggers().entries()) {
      const label = renderer!.root.find((node) => node.props.id === trigger.props['aria-labelledby']);
      expect(label.children).toEqual([experienceTimelineEntries[index].title]);
      expect(trigger.props['aria-expanded']).toBe(false);
      expect(sheet(trigger).props.inert).toBe(true);
    }
  });

  it('keeps exactly one pin, opens its sheet, and gives toggle feedback', async () => {
    const { triggers, sheet, item } = await renderTimeline();
    await act(async () => triggers()[0].props.onClick());
    expect(triggers()[0].props['aria-expanded']).toBe(true);
    expect(sheet(triggers()[0]).props.inert).toBe(false);
    expect(item(triggers()[0]).props['data-pinned']).toBe(true);
    await act(async () => triggers()[1].props.onClick());
    expect(triggers().map(({ props }) => props['aria-expanded'])).toEqual([false, true, false, false, false, false]);
    expect(sheet(triggers()[0]).props.inert).toBe(true);
    expect(item(triggers()[0]).props['data-pinned']).toBeUndefined();
    await act(async () => triggers()[1].props.onClick());
    expect(triggers().some(({ props }) => props['aria-expanded'])).toBe(false);
    expect(feedback.selection).toHaveBeenCalledTimes(2);
    expect(feedback.toggle).toHaveBeenCalledOnce();
  });

  it('unpins on Escape from a pinned tile without swallowing other keys', async () => {
    const { triggers } = await renderTimeline();
    const stopPropagation = vi.fn();
    await act(async () => triggers()[2].props.onKeyDown({ key: 'Escape', stopPropagation }));
    expect(stopPropagation).not.toHaveBeenCalled();
    await act(async () => triggers()[2].props.onClick());
    await act(async () => triggers()[2].props.onKeyDown({ key: 'Tab', stopPropagation }));
    expect(triggers()[2].props['aria-expanded']).toBe(true);
    expect(stopPropagation).not.toHaveBeenCalled();
    await act(async () => triggers()[2].props.onKeyDown({ key: 'Escape', stopPropagation }));
    expect(triggers()[2].props['aria-expanded']).toBe(false);
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it('puts an open card away on a click outside it or on Escape anywhere', async () => {
    const { triggers } = await renderTimeline();
    const click = (insideCard: boolean) => act(async () => {
      Object.assign(page, { closest: () => (insideCard ? page : null) });
      page.dispatchEvent(new Event('click'));
    });
    const press = (key: string) => act(async () => {
      page.dispatchEvent(Object.assign(new Event('keydown'), { key }));
    });

    await act(async () => triggers()[0].props.onClick());
    await click(true);
    await press('Tab');
    expect(triggers()[0].props['aria-expanded']).toBe(true);
    await click(false);
    expect(triggers()[0].props['aria-expanded']).toBe(false);

    await act(async () => triggers()[3].props.onClick());
    await press('Escape');
    expect(triggers()[3].props['aria-expanded']).toBe(false);
  });

  it('opens the About voice context through the resume source', async () => {
    const { requestVoiceMode } = await import('@/lib/voiceModeStore');
    await act(async () => { renderer = TestRenderer.create(React.createElement(AboutVoiceLink)); });
    await act(async () => renderer!.root.findByType('button').props.onClick());
    expect(requestVoiceMode).toHaveBeenCalledWith({ source: 'resume', topic: 'about' });
  });
});
