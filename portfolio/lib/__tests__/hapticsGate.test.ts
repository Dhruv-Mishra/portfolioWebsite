import { afterEach, describe, expect, it, vi } from 'vitest';

const webHaptics = vi.hoisted(() => ({ loads: 0, trigger: vi.fn() }));

vi.mock('web-haptics', () => {
  webHaptics.loads += 1;
  return {
    WebHaptics: class {
      trigger = webHaptics.trigger;
      cancel = vi.fn();
    },
  };
});

vi.mock('@/hooks/useSitePrefs', () => ({
  getSitePrefsSnapshot: () => ({ hapticsEnabled: true }),
}));

import { shouldAllowHaptics } from '@/lib/haptics';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('haptics preference gate', () => {
  it('blocks haptics when the persisted preference is disabled', () => {
    expect(shouldAllowHaptics({
      enabled: false,
      visibilityState: 'visible',
      interactionMode: 'touch',
      interactionAgeMs: 10,
    })).toBe(false);
  });

  it('preserves touch, pen, visibility, and recent-interaction requirements', () => {
    expect(shouldAllowHaptics({
      enabled: true,
      visibilityState: 'visible',
      interactionMode: 'touch',
      interactionAgeMs: 2500,
    })).toBe(true);
    expect(shouldAllowHaptics({
      enabled: true,
      visibilityState: 'visible',
      interactionMode: 'pen',
      interactionAgeMs: 20,
    })).toBe(true);
    expect(shouldAllowHaptics({
      enabled: true,
      visibilityState: 'hidden',
      interactionMode: 'touch',
      interactionAgeMs: 20,
    })).toBe(false);
    expect(shouldAllowHaptics({
      enabled: true,
      visibilityState: 'visible',
      interactionMode: 'mouse',
      interactionAgeMs: 20,
    })).toBe(false);
    expect(shouldAllowHaptics({
      enabled: true,
      visibilityState: 'visible',
      interactionMode: 'touch',
      interactionAgeMs: 2501,
    })).toBe(false);
  });

  it('loads the haptics engine only after touch input, then fires through it', async () => {
    const listeners = new Map<string, (event: { pointerType?: string }) => void>();
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: (event: { pointerType?: string }) => void) => {
        listeners.set(type, listener);
      },
    });
    vi.stubGlobal('document', { visibilityState: 'visible' });
    vi.stubGlobal('navigator', { maxTouchPoints: 0 });
    vi.resetModules();
    const { useAppHaptics } = await import('@/lib/haptics');
    const haptics = useAppHaptics();

    listeners.get('pointerdown')?.({ pointerType: 'mouse' });
    haptics.tap();
    await vi.dynamicImportSettled();
    expect(webHaptics.loads).toBe(0);

    listeners.get('pointerdown')?.({ pointerType: 'touch' });
    await vi.dynamicImportSettled();
    expect(webHaptics.loads).toBe(1);

    haptics.tap();
    expect(webHaptics.trigger).toHaveBeenCalledWith('medium');
  });

  it('keeps focus moved after a tap or click ring-free, and rings it after the keyboard', async () => {
    const listeners = new Map<string, (event: { pointerType?: string }) => void>();
    vi.stubGlobal('window', { addEventListener: (type: string, listener: (event: { pointerType?: string }) => void) => listeners.set(type, listener) });
    vi.stubGlobal('navigator', { maxTouchPoints: 0 });
    vi.resetModules();
    const { moveFocus } = await import('@/lib/quietFocus');
    const target = () => ({ dataset: {} as Record<string, string>, focus: vi.fn(), addEventListener: vi.fn() });

    const beforeInput = target();
    moveFocus(beforeInput as unknown as HTMLElement);
    expect(beforeInput.dataset).toHaveProperty('quietFocus');

    listeners.get('keydown')?.({});
    const afterKey = target();
    moveFocus(afterKey as unknown as HTMLElement);
    expect(afterKey.dataset).not.toHaveProperty('quietFocus');
    expect(afterKey.focus).toHaveBeenCalledWith({ preventScroll: true });

    listeners.get('pointerdown')?.({ pointerType: 'touch' });
    const afterTap = target();
    moveFocus(afterTap as unknown as HTMLElement);
    expect(afterTap.dataset).toHaveProperty('quietFocus');
  });
});