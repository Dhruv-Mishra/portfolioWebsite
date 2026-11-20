import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePendingGuestbookEntries } from '@/components/GuestbookPendingStore';
import { GUESTBOOK_PENDING_CHANGED_EVENT, GUESTBOOK_PENDING_STORAGE_KEY, addPendingGuestbookEntry, setPendingGuestbookEntries } from '@/lib/guestbookPending';

let renderer: TestRenderer.ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const values = new Map<string, string>();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } }));
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Subscriber() {
  return React.createElement('output', null, String(usePendingGuestbookEntries().length));
}

it('shares browser listeners and updates every pending-note subscriber', async () => {
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  await act(async () => { renderer = TestRenderer.create(React.createElement(React.Fragment, null, React.createElement(Subscriber), React.createElement(Subscriber))); });
  expect(add.mock.calls.map(([type]) => type)).toEqual([GUESTBOOK_PENDING_CHANGED_EVENT, 'storage']);
  expect(renderer!.root.findAllByType('output').map((node) => node.children)).toEqual([['0'], ['0']]);
  await act(async () => { addPendingGuestbookEntry({ name: 'Visitor', message: 'A new pending note' }); });
  expect(renderer!.root.findAllByType('output').map((node) => node.children)).toEqual([['1'], ['1']]);
  await act(async () => { setPendingGuestbookEntries([]); });
  expect(renderer!.root.findAllByType('output').map((node) => node.children)).toEqual([['0'], ['0']]);
  await act(async () => renderer!.unmount());
  renderer = undefined;
  expect(remove.mock.calls.map(([type]) => type)).toEqual([GUESTBOOK_PENDING_CHANGED_EVENT, 'storage']);
});

it('updates after cross-tab storage clears as well as key-specific changes', async () => {
  await act(async () => { renderer = TestRenderer.create(React.createElement(Subscriber)); });
  const entry = { id: '1', name: 'Visitor', message: 'From another tab', createdAt: new Date().toISOString() };
  window.localStorage.setItem(GUESTBOOK_PENDING_STORAGE_KEY, JSON.stringify([entry]));
  await act(async () => { window.dispatchEvent(Object.assign(new Event('storage'), { key: GUESTBOOK_PENDING_STORAGE_KEY })); });
  expect(renderer!.root.findByType('output').children).toEqual(['1']);
  window.localStorage.removeItem(GUESTBOOK_PENDING_STORAGE_KEY);
  await act(async () => { window.dispatchEvent(Object.assign(new Event('storage'), { key: null })); });
  expect(renderer!.root.findByType('output').children).toEqual(['0']);
});
