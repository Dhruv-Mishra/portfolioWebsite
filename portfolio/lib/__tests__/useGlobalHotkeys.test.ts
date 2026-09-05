import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGlobalHotkeys } from '@/hooks/useGlobalHotkeys';
import { KEYBINDINGS } from '@/lib/keybindings';

class EditableTarget {
  constructor(readonly tagName: string, readonly isContentEditable = false) {}
}

describe('global keyboard shortcuts', () => {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  let listener: ((event: KeyboardEvent) => void) | undefined;
  let finePointer: boolean;
  const openShortcuts = vi.fn();
  const toggleTheme = vi.fn();
  const push = vi.fn();
  const removeEventListener = vi.fn();

  function Harness() {
    useGlobalHotkeys({ router: { push } as never, openShortcuts, toggleTheme });
    return null;
  }

  function press(key: string, extra: Partial<KeyboardEvent> = {}) {
    const preventDefault = vi.fn();
    act(() => listener?.({ key, preventDefault, ...extra } as unknown as KeyboardEvent));
    return preventDefault;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    finePointer = true;
    listener = undefined;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('HTMLElement', EditableTarget);
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: finePointer }),
      addEventListener: (_name: string, handler: typeof listener) => { listener = handler; },
      removeEventListener,
    });
    await act(async () => { renderer = TestRenderer.create(React.createElement(Harness)); });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    vi.unstubAllGlobals();
  });

  it('opens keyboard help only on request and keeps theme and navigation shortcuts', () => {
    expect(openShortcuts).not.toHaveBeenCalled();
    expect(press('?')).toHaveBeenCalledOnce();
    expect(openShortcuts).toHaveBeenCalledOnce();
    press('t');
    expect(toggleTheme).toHaveBeenCalledOnce();
    press('g');
    press('p');
    expect(push).toHaveBeenCalledWith('/projects');
    expect(KEYBINDINGS.filter(binding => binding.group === 'Actions').map(binding => binding.keys)).toEqual([['t'], ['?']]);
  });

  it('leaves modifier keys, composition, and editable fields alone', () => {
    expect(press('k', { ctrlKey: true })).not.toHaveBeenCalled();
    expect(press('k', { metaKey: true })).not.toHaveBeenCalled();
    expect(press('?', { isComposing: true })).not.toHaveBeenCalled();
    for (const target of [
      new EditableTarget('INPUT'),
      new EditableTarget('TEXTAREA'),
      new EditableTarget('SELECT'),
      new EditableTarget('DIV', true),
    ]) {
      expect(press('?', { target: target as unknown as EventTarget })).not.toHaveBeenCalled();
    }
    expect(openShortcuts).not.toHaveBeenCalled();
    expect(toggleTheme).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('does not open desktop keyboard help on touch-only devices', async () => {
    await act(async () => renderer?.unmount());
    finePointer = false;
    await act(async () => { renderer = TestRenderer.create(React.createElement(Harness)); });
    expect(press('?')).not.toHaveBeenCalled();
    expect(openShortcuts).not.toHaveBeenCalled();
  });

  it('removes its listener on unmount', async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    expect(removeEventListener).toHaveBeenCalledExactlyOnceWith('keydown', listener);
  });
});