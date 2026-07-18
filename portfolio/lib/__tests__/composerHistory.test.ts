import { describe, expect, it } from 'vitest';
import {
  appendComposerHistory,
  canNavigateComposerHistory,
  createComposerHistoryState,
  navigateComposerHistory,
  resetComposerHistoryNavigation,
} from '@/lib/composerHistory';

function historyWith(...messages: string[]) {
  return messages.reduce(appendComposerHistory, createComposerHistoryState());
}

describe('composer history', () => {
  it('only permits history traversal from a collapsed selection on the matching logical boundary', () => {
    const value = 'first line\nsecond line\nthird line';

    expect(canNavigateComposerHistory(value, 0, 0, 'up')).toBe(true);
    expect(canNavigateComposerHistory(value, 11, 11, 'up')).toBe(false);
    expect(canNavigateComposerHistory(value, value.length, value.length, 'down')).toBe(true);
    expect(canNavigateComposerHistory(value, 11, 11, 'down')).toBe(false);
    expect(canNavigateComposerHistory(value, 0, 5, 'up')).toBe(false);
    expect(canNavigateComposerHistory(value, value.length - 1, value.length, 'down')).toBe(false);
  });

  it('keeps the five most recently submitted messages and resets traversal on send', () => {
    const history = historyWith('one', 'two', 'three', 'four', 'five', 'six');
    const recalled = navigateComposerHistory(history, 'draft', 'up');

    expect(history.messages).toEqual(['two', 'three', 'four', 'five', 'six']);
    expect(recalled.value).toBe('six');
    expect(recalled.state.navigationIndex).toBe(4);
    expect(appendComposerHistory(recalled.state, 'seven')).toMatchObject({
      messages: ['three', 'four', 'five', 'six', 'seven'],
      navigationIndex: null,
      draft: null,
    });
  });

  it('walks backward with up, clamps at the oldest, and restores the captured draft after newest', () => {
    const history = historyWith('oldest', 'middle', 'newest');
    const newest = navigateComposerHistory(history, 'exact unsent draft', 'up');
    const middle = navigateComposerHistory(newest.state, newest.value, 'up');
    const oldest = navigateComposerHistory(middle.state, middle.value, 'up');
    const clamped = navigateComposerHistory(oldest.state, oldest.value, 'up');
    const newer = navigateComposerHistory(clamped.state, clamped.value, 'down');
    const newestAgain = navigateComposerHistory(newer.state, newer.value, 'down');
    const restored = navigateComposerHistory(newestAgain.state, newestAgain.value, 'down');

    expect([newest.value, middle.value, oldest.value, clamped.value]).toEqual([
      'newest',
      'middle',
      'oldest',
      'oldest',
    ]);
    expect(restored).toMatchObject({
      value: 'exact unsent draft',
      didNavigate: true,
      state: { navigationIndex: null, draft: null },
    });
  });

  it('leaves empty history and down outside traversal untouched, while editing resets traversal only', () => {
    const empty = createComposerHistoryState();
    const noHistory = navigateComposerHistory(empty, 'draft', 'up');
    const history = historyWith('submitted');
    const noTraversal = navigateComposerHistory(history, 'draft', 'down');
    const recalled = navigateComposerHistory(history, 'draft', 'up');

    expect(noHistory).toEqual({ state: empty, value: 'draft', didNavigate: false });
    expect(noTraversal).toEqual({ state: history, value: 'draft', didNavigate: false });
    expect(resetComposerHistoryNavigation(recalled.state)).toEqual({
      messages: ['submitted'],
      navigationIndex: null,
      draft: null,
    });
  });
});