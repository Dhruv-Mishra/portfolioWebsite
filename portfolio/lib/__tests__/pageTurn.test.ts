import { describe, expect, it } from 'vitest';
import {
  PAGE_TURN_ROUTES,
  PageTurnHistoryTracker,
  createPageTurnTransition,
  finishPageTurn,
  getPageTurnSnapshot,
  normalizePageTurnPath,
  resolvePageTurnRoute,
  startPageTurn,
  subscribeToPageTurn,
} from '@/lib/pageTurn';

describe('page-turn route model', () => {
  it('assigns a stable page number to every visible route and not found', () => {
    expect(PAGE_TURN_ROUTES.map(({ path, page }) => [path, page])).toEqual([
      ['/', 1],
      ['/projects', 2],
      ['/about', 3],
      ['/resume', 4],
      ['/chat', 5],
      ['/guestbook', 6],
      ['/stickers', 7],
      ['/matrix-notes', 8],
      ['/settings', 9],
      ['*', 10],
    ]);
  });

  it('normalizes query, hash, and trailing slash changes as the same route', () => {
    expect(normalizePageTurnPath('/projects/?view=grid#featured')).toBe('/projects');
    expect(createPageTurnTransition('/projects', '/projects/?view=grid#featured')).toBeNull();
  });

  it('uses route order for normal navigation and caps multi-page travel', () => {
    expect(createPageTurnTransition('/', '/projects')).toMatchObject({
      direction: 'forward',
      distance: 1,
      fromPage: 1,
      toPage: 2,
    });
    expect(createPageTurnTransition('/settings', '/matrix-notes')).toMatchObject({
      direction: 'backward',
      distance: 1,
    });
    expect(createPageTurnTransition('/', '/settings')).toMatchObject({
      direction: 'forward',
      distance: 3,
    });
    expect(createPageTurnTransition('/settings', '/')).toMatchObject({
      direction: 'backward',
      distance: 3,
    });
  });

  it('lets browser history direction override route order', () => {
    expect(createPageTurnTransition('/', '/settings', -1)).toMatchObject({
      direction: 'backward',
      distance: 3,
    });
    expect(createPageTurnTransition('/settings', '/', 1)).toMatchObject({
      direction: 'forward',
      distance: 3,
    });
  });

  it('uses deterministic parent and not-found fallbacks', () => {
    const nestedProject = resolvePageTurnRoute('/projects/private-case-study');
    const unknownA = resolvePageTurnRoute('/missing-a');
    const unknownAAgain = resolvePageTurnRoute('/missing-a');
    const unknownB = resolvePageTurnRoute('/missing-b');

    expect(nestedProject.page).toBe(2);
    expect(nestedProject.position).toBeGreaterThan(2);
    expect(unknownA.page).toBe(10);
    expect(unknownA.position).toBe(unknownAAgain.position);
    expect(unknownA.position).not.toBe(unknownB.position);
  });
});

describe('page-turn history state', () => {
  it('tracks push, replace, back, and forward indexes', () => {
    const tracker = new PageTurnHistoryTracker(4);
    expect(tracker.push()).toBe(5);
    expect(tracker.replace()).toBe(5);
    expect(tracker.pop(2)).toBe(-3);
    expect(tracker.pop(5)).toBe(3);
    expect(tracker.pop(undefined)).toBeUndefined();
    expect(tracker.pop(5)).toBeUndefined();
  });

  it('does not let an old completion clear a newer transition snapshot', () => {
    const first = createPageTurnTransition('/', '/projects');
    const second = createPageTurnTransition('/projects', '/settings');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    startPageTurn(first);
    startPageTurn(second);
    finishPageTurn(first!.sequence);
    expect(getPageTurnSnapshot()).toBe(second);
    finishPageTurn(second!.sequence);
    expect(getPageTurnSnapshot()).toBeNull();
  });

  it('publishes snapshots synchronously but notifies outside the history mutation', async () => {
    const notifications: Array<ReturnType<typeof getPageTurnSnapshot>> = [];
    const unsubscribe = subscribeToPageTurn(() => {
      notifications.push(getPageTurnSnapshot());
    });
    const transition = createPageTurnTransition('/', '/projects');

    startPageTurn(transition);
    expect(getPageTurnSnapshot()).toBe(transition);
    expect(notifications).toEqual([]);

    await Promise.resolve();
    expect(notifications).toEqual([transition]);

    unsubscribe();
    finishPageTurn(transition!.sequence);
    await Promise.resolve();
  });
});