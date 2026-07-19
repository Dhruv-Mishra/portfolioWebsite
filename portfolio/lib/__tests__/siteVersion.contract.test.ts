import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import packageJson from '@/package.json';
import { APP_VERSION } from '@/lib/constants';
import { RESUME_PDF_URL, SITE_VERSION, SITE_VERSION_LABEL } from '@/lib/siteVersion';

const readSource = (relativePath: string) => fs.readFileSync(
  path.join(process.cwd(), relativePath),
  'utf8',
);

describe('site version contract', () => {
  it('derives the display version from package metadata', () => {
    expect(SITE_VERSION).toBe(packageJson.version);
    expect(SITE_VERSION_LABEL).toBe(`v${packageJson.version}`);
    expect(APP_VERSION).toBe(SITE_VERSION_LABEL);
  });

  it('versions the mutable resume URL with the current release', () => {
    expect(RESUME_PDF_URL).toBe(`/resources/resume.pdf?v=${packageJson.version}`);
  });

  it('uses the shared label on the homepage and at the bottom of Settings', () => {
    expect(readSource('app/page.tsx')).toContain('{SITE_VERSION_LABEL}');
    expect(readSource('components/SettingsPanel.tsx')).toContain('Website {SITE_VERSION_LABEL}');
  });
});