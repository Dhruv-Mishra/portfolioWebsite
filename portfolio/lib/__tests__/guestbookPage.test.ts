import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GuestbookPage from '@/app/guestbook/page';
import GuestbookPendingNotes from '@/components/GuestbookPendingNotes';
import GuestbookWall from '@/components/GuestbookWall';
import { GuestbookEmptyState } from '@/components/GuestbookEmptyState';
import type { GuestbookEntry } from '@/lib/guestbook';
import { GUESTBOOK_LIMITS } from '@/lib/designTokens';

const { load } = vi.hoisted(() => ({ load: vi.fn<() => Promise<GuestbookEntry[]>>() }));
vi.mock('@/lib/guestbook.server', () => ({ getApprovedEntries: load }));
vi.mock('next/link', () => ({ default: 'a' }));
vi.mock('@/components/ui/WavyUnderline', () => ({ WavyUnderline: () => null }));
vi.mock('@/components/GuestbookForm', () => ({ default: () => null }));
vi.mock('@/components/GuestbookPendingNotes', () => ({ default: () => null }));
vi.mock('@/components/GuestbookWall', () => ({ default: () => null }));
vi.mock('@/components/GuestbookEmptyState', () => ({ GuestbookEmptyState: () => null }));
vi.mock('@/components/GuestbookPendingEmptyGate', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
let renderer: TestRenderer.ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); load.mockReset(); });
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; vi.unstubAllGlobals(); });
async function render(page = '1') {
  const element = await GuestbookPage({ searchParams: Promise.resolve({ page }) });
  await act(async () => { renderer = TestRenderer.create(element); });
  return renderer!;
}

describe('guestbook wall states and reconciliation', () => {
  it('reserves the empty invitation for successful empty loads', async () => {
    load.mockResolvedValue([]);
    const view = await render();
    expect(view.root.findAllByType(GuestbookEmptyState)).toHaveLength(1);
    expect(view.root.findAllByProps({ role: 'status' })).toHaveLength(0);
  });
  it('shows a retry note rather than the empty invitation on failure', async () => {
    load.mockRejectedValue(new Error('GitHub unavailable'));
    const view = await render();
    expect(view.root.findAllByType(GuestbookEmptyState)).toHaveLength(0);
    expect(view.root.findByProps({ role: 'status' }).children.join('')).toMatch(/couldn't load the wall.*refresh/i);
  });
  it('sends only names and messages for all approved entries, not just the current page', async () => {
    const entries = Array.from({ length: GUESTBOOK_LIMITS.notesPerPage + 1 }, (_, index) => ({
      id: index + 1, name: `Visitor ${index}`, message: `Note number ${index}`, createdAt: '2026-11-20T00:00:00Z',
    }));
    load.mockResolvedValue(entries);
    const view = await render('2');
    expect(view.root.findByType(GuestbookWall).props.entries).toEqual([entries.at(-1)]);
    expect(view.root.findByType(GuestbookPendingNotes).props.approvedEntries).toEqual(entries.map(({ name, message }) => ({ name, message })));
  });
});
