import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuestbookEntry } from '@/lib/guestbook';
import {
  GUESTBOOK_PENDING_STORAGE_KEY,
  addPendingGuestbookEntry,
  getPendingGuestbookEntries,
  removeApprovedPendingGuestbookEntries,
} from '@/lib/guestbookPending';

function createLocalStorageMock() {
  const store = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  };
}

describe('guestbook pending localStorage entries', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: createLocalStorageMock(),
      dispatchEvent: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists a submitted pending entry across reads', () => {
    const savedEntry = addPendingGuestbookEntry({
      message: '  This wall is delightful  ',
      name: ' Dhruv ',
    });

    expect(savedEntry).toMatchObject({
      message: 'This wall is delightful',
      name: 'Dhruv',
    });
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      GUESTBOOK_PENDING_STORAGE_KEY,
      expect.any(String),
    );
    expect(getPendingGuestbookEntries()).toMatchObject([
      {
        message: 'This wall is delightful',
        name: 'Dhruv',
      },
    ]);
  });

  it('removes a local pending entry once an approved backend entry matches it', () => {
    const pendingEntry = addPendingGuestbookEntry({
      message: 'Looks great from my browser',
      name: 'Dhruv',
    });
    const approvedEntries: GuestbookEntry[] = [
      {
        id: 42,
        message: 'Looks great   from my browser',
        name: 'Dhruv',
        createdAt: new Date().toISOString(),
      },
    ];

    expect(pendingEntry).not.toBeNull();
    expect(removeApprovedPendingGuestbookEntries(getPendingGuestbookEntries(), approvedEntries)).toEqual([]);
  });
});