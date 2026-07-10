import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) => fs.readFileSync(
  path.join(process.cwd(), relativePath),
  'utf8',
);

const settings = readSource('components/SettingsPanel.tsx');
const layout = readSource('components/SketchbookLayout.tsx');
const globals = readSource('app/globals.css');
const eagerEnhancements = readSource('components/EagerEnhancements.tsx');

describe('settings visual preference contracts', () => {
  it('wires paper grain to the actual texture layer and tape to an in-place sample', () => {
    expect(layout).toContain('data-paper-grain');
    expect(globals).toMatch(/html:not\(\[data-pref-paper="on"\]\) \[data-paper-grain\]/);
    expect(settings).toContain('<TapeStrip');
    expect(globals).toMatch(/html:not\(\[data-pref-tape="on"\]\) \[data-tape-strip\]/);
  });

  it('requires the labelled warning modal before enabling experiments', () => {
    expect(settings).toContain("intent === 'confirm-enable'");
    expect(settings).toContain('ariaLabelledBy="experimental-features-title"');
    expect(settings).toContain('ariaDescribedBy="experimental-features-description"');
    expect(settings).toContain('Staging can be unstable and may use preview data or features.');
    expect(settings).toContain('Enable and open staging');
    expect(settings).toContain('Cancel');
  });

  it('mounts the post-hydration redirect controller globally', () => {
    expect(eagerEnhancements).toContain('<ExperimentalFeaturesController />');
  });

  it('persists and removes the staging handoff after hydration', () => {
    const controller = readSource('components/ExperimentalFeaturesController.tsx');
    expect(controller).toContain("setSitePref('experimentalFeatures', true)");
    expect(controller).toContain('window.history.replaceState');
  });
});