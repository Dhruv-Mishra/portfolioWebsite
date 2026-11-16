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

const feedback = vi.hoisted(() => ({ closePanel: vi.fn(), openPanel: vi.fn(), tap: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ useAppHaptics: () => feedback }));
vi.mock('@/lib/soundManager', () => ({ soundManager: { play: vi.fn() } }));
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
    renderer = TestRenderer.create(React.createElement(ExperienceTimeline));
  });
  const root = renderer!.root;
  const openers = () => root.findAll((node) => node.type === 'button' && node.props['data-flyout-open'] !== undefined);
  const dialog = () => root.findByType('dialog');
  return { root, openers, dialog };
}

describe('experience timeline photos', () => {
  it('names each photo by its role and opens it as a dialog', async () => {
    const { openers, dialog } = await renderTimeline();
    expect(openers().map((button) => button.children.join(''))).toEqual(experienceTimelineEntries.map(({ title }) => title));
    for (const button of openers()) expect(button.props['aria-haspopup']).toBe('dialog');
    expect(dialog().findAll((node) => node.type === 'article')).toHaveLength(0);
  });

  it('opens the whole story of the chosen role, labelled by its title', async () => {
    const { root, openers, dialog } = await renderTimeline();
    const entry = experienceTimelineEntries[0];
    await act(async () => openers()[0].props.onClick());
    const heading = root.find((node) => node.props.id === dialog().props['aria-labelledby']);
    expect(heading.children).toEqual([entry.title]);
    const items = dialog().findAll((node) => node.type === 'li').map((node) => node.children.join(''));
    expect(items).toEqual([...entry.highlights, ...entry.tools]);
    expect(feedback.tap).toHaveBeenCalledOnce();
  });

  it('opens the About voice context through the resume source', async () => {
    const { requestVoiceMode } = await import('@/lib/voiceModeStore');
    await act(async () => { renderer = TestRenderer.create(React.createElement(AboutVoiceLink)); });
    await act(async () => renderer!.root.findByType('button').props.onClick());
    expect(requestVoiceMode).toHaveBeenCalledWith({ source: 'resume', topic: 'about' });
  });
});