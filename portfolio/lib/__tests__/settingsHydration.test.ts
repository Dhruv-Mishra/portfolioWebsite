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

  it('waits for the settings controls before one-shot model focus', () => {
    expect(source).toContain('const modelTargetFocusedRef = useRef(false)');
    expect(source).toContain('if (modelTargetFocusedRef.current || !mounted) return;');
    expect(source).toContain('if (!target || !modelControl) return;');
    expect(source).toContain('modelTargetFocusedRef.current = true;');
    expect(source).toContain('}, [mounted]);');
  });

  it('keeps voice input and output as independent settings', () => {
    expect(source).toContain('SettingsGroup title="Voice input"');
    expect(source).toContain('SettingsGroup title="Voice output"');
    expect(source).toContain("name=\"voice-backend\"");
    expect(source).toContain("name=\"voice-output\"");
    expect(source).toContain("label: 'Device TTS'");
    expect(source).toContain("label: 'Server custom'");
  });
});