/**
 * Predicate + metadata tests for the sticker roster. Covers the "all regular
 * stickers earned → superuser awarded" logic at the pure-function level so
 * regressions that change the roster size but forget the store are caught.
 */
import { describe, it, expect } from 'vitest';
import {
  STICKER_ROSTER,
  SUPERUSER_STICKER,
  REGULAR_STICKER_IDS,
  hasEarnedAllRegularStickers,
  getSticker,
  STICKER_TOTAL,
} from '@/lib/stickers';

describe('sticker roster metadata', () => {
  it('rosterIds are unique', () => {
    const ids = STICKER_ROSTER.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every roster entry has label, description, hint, family', () => {
    for (const sticker of STICKER_ROSTER) {
      expect(sticker.id.length).toBeGreaterThan(0);
      expect(sticker.label.length).toBeGreaterThan(0);
      expect(sticker.description.length).toBeGreaterThan(0);
      expect(sticker.hint.length).toBeGreaterThan(0);
      expect(sticker.family.length).toBeGreaterThan(0);
    }
  });

  it('superuser is NOT in the visible roster', () => {
    expect(STICKER_ROSTER.some((s) => (s.id as string) === SUPERUSER_STICKER.id)).toBe(false);
  });

  it('superuser is retrievable via getSticker', () => {
    expect(getSticker('superuser').id).toBe('superuser');
  });

  it('REGULAR_STICKER_IDS has the same size as STICKER_TOTAL', () => {
    expect(REGULAR_STICKER_IDS.size).toBe(STICKER_TOTAL);
  });

  it('STICKER_TOTAL is in the target 18-22 range', () => {
    expect(STICKER_TOTAL).toBeGreaterThanOrEqual(18);
    expect(STICKER_TOTAL).toBeLessThanOrEqual(22);
  });

  it('the retired `konami` sticker is not in the roster', () => {
    // Konami was removed because its keyboard-only emit path had no
    // mobile-reachable trigger. Make sure regressions don't silently re-add it.
    expect(STICKER_ROSTER.some((s) => (s.id as string) === 'konami')).toBe(false);
  });

  it('every roster id has a mobile-attainable trigger (manual audit)', () => {
    // This is a static sentinel — the audit is performed in the PR
    // description / code review. The test exists so that adding a new
    // sticker to the roster forces someone to update this list consciously.
    const auditedMobileReachable: ReadonlyArray<string> = [
      'first-word',       // typing in on-screen keyboard
      'help-wanted',      // typing `help`
      'stand-up-comic',   // typing `joke`
      'theme-flipper',    // mobile theme button in SocialSidebar
      'note-sender',      // mobile feedback button
      'page-turner',      // mobile navigation
      'note-passer',      // MiniChat FAB (mobile-sized)
      'long-read',        // timed resume page view
      'full-chat',        // /chat navigation
      'night-owl',        // time-based (any device)
      'signed-guestbook', // guestbook form
      'project-explorer', // project modal taps
      'cheat-codes',      // typing `cheatsheet`
      'drawer-dweller',   // /stickers navigation
      'chat-conductor',   // chat AI perform-action
      'terminal-addict',  // 5 distinct commands
      'repo-hunter',      // project modal external link
      'social-butterfly', // social pill link tap
      'phoned-a-friend',  // jarvis live-demo external link tap
    ];
    const rosterIds = STICKER_ROSTER.map((s) => s.id);
    for (const audited of auditedMobileReachable) {
      expect(rosterIds).toContain(audited);
    }
    // The audit list size must equal the roster size — catches silent adds.
    expect(auditedMobileReachable.length).toBe(STICKER_ROSTER.length);
  });
});

describe('hasEarnedAllRegularStickers', () => {
  it('returns false for empty list', () => {
    expect(hasEarnedAllRegularStickers([])).toBe(false);
  });

  it('returns false if even one regular sticker is missing', () => {
    const missingOne = STICKER_ROSTER.slice(0, -1).map((s) => s.id);
    expect(hasEarnedAllRegularStickers(missingOne)).toBe(false);
  });

  it('returns true when every regular sticker is unlocked (order-independent)', () => {
    const all = STICKER_ROSTER.map((s) => s.id);
    expect(hasEarnedAllRegularStickers(all)).toBe(true);
    // Reversed order
    expect(hasEarnedAllRegularStickers([...all].reverse())).toBe(true);
  });

  it('returns true if all regulars are unlocked even alongside the superuser itself', () => {
    const all = STICKER_ROSTER.map((s) => s.id);
    expect(hasEarnedAllRegularStickers([...all, 'superuser'])).toBe(true);
  });

  it('ignores duplicate entries (defensive — store prevents this but predicate is pure)', () => {
    const all = STICKER_ROSTER.map((s) => s.id);
    const withDupes = [...all, all[0], all[1]];
    expect(hasEarnedAllRegularStickers(withDupes)).toBe(true);
  });

  it('does not award if the only thing in the list is the superuser id alone', () => {
    expect(hasEarnedAllRegularStickers(['superuser'])).toBe(false);
  });
});
