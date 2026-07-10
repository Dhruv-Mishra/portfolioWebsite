import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.join(process.cwd(), 'components', 'SettingsPanel.tsx'),
  'utf8',
);

describe('settings hydration contract', () => {
  it('keeps the complete control surface in flow without exposing default values', () => {
    expect(source).toContain("!mounted && 'invisible'");
    expect(source).toContain('aria-hidden={!mounted || undefined}');
    expect(source).toContain('inert={!mounted || undefined}');
    expect(source).toContain('aria-busy={!mounted}');
    expect(source).not.toMatch(/if \(!mounted\)\s+return/);
  });

  it('announces the temporary loading state without leaving controls inert', () => {
    expect(source).toMatch(/role="status"[^>]*aria-live="polite"/);
    expect(source).toContain('Loading saved settings...');
    expect(source).toContain('getClientHydrationSnapshot = () => true');
    expect(source).toContain('getServerHydrationSnapshot = () => false');
  });
});