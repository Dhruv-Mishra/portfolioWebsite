import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

const controller = read('components/HoverTiltController.tsx');
const eager = read('components/EagerEnhancements.tsx');
const css = read('app/globals.css');
const projects = read('app/projects/page.tsx');
const timeline = read('components/ExperienceTimeline.tsx');
const about = read('app/about/page.tsx');

describe('delegated hover-tilt contract', () => {
  it('mounts one document pointerover listener and no pointermove or per-card handlers', () => {
    expect(eager).toContain("import HoverTiltController from '@/components/HoverTiltController'");
    expect(eager).not.toContain("import('@/components/HoverTiltController')");
    expect(eager).toContain('<HoverTiltController />');
    expect(controller).toContain("document.addEventListener('pointerover'");
    expect(controller).toContain('(hover: hover) and (pointer: fine)');
    expect(controller).toContain('window.matchMedia');
    expect(controller).toContain("closest<HTMLElement>('[data-hover-tilt]')");
    expect(controller).toContain('el.contains(related)');
    expect(controller).toContain("el.style.setProperty('--hover-tilt'");
    expect(controller).not.toContain('pointermove');
    expect(controller).not.toContain('useState');
    expect(controller).not.toMatch(/from\s+['"]framer-motion['"]/);
    expect(projects).not.toMatch(/onPointer(Over|Move|Enter)|whileHover/);
    expect(timeline).not.toMatch(/onPointer(Over|Move|Enter)|whileHover/);
  });

  it('opts project cards and timeline wrappers into the CSS contract without tilting the About sheet', () => {
    expect(css).toMatch(/\[data-hover-tilt\]:hover/);
    expect(css).toMatch(/transition-property:\s*transform,\s*scale/);
    expect(css).toMatch(/--hover-tilt-scale/);
    expect(css).not.toMatch(/\[data-hover-tilt\][\s\S]{0,180}will-change/);
    expect(css).not.toMatch(/\[data-project-card\]/);
    expect(projects).toContain('data-hover-tilt');
    expect(projects).not.toContain('data-project-card');
    expect(projects).toContain("'--hover-tilt-scale': '1.018'");
    expect(timeline).toContain('data-hover-tilt');
    expect(timeline.indexOf('data-hover-tilt')).toBeLessThan(timeline.indexOf('data-disco-motion="wiggle"'));
    expect(timeline).toContain('data-disco-motion="wiggle"');
    expect(css).toMatch(/html:not\(\[data-motion="full"\]\) \[data-hover-tilt\] \{ transform: none/);
    expect(css).toMatch(/html\[data-motion="reduced"\] \[data-hover-tilt\] \{ transform: none/);
    expect(about).not.toContain('data-hover-tilt');
    expect(about).not.toContain('"use client"');
  });
});
