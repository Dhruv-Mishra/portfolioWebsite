/**
 * Unit tests for the public `disco` terminal command + the new
 * `themeAction: 'disco' | 'disco-off'` chat actions.
 *
 * `disco` migrated out of `sudo` and is now a regular command — same
 * two-step confirm flow (`disco` → warn, `disco yes` → engage,
 * `disco off` → disengage, `disco no` → cancel).
 */
import { describe, it, expect } from 'vitest';
import { handleDisco } from '@/lib/sudoCommands';
import {
  ACTION_REGISTRY,
  DISCO_ACTION_LABEL,
  VALID_THEME_ACTIONS,
  getActionFallbackReply,
  getFollowupActions,
  getInitialChatSuggestions,
  getPromotedFollowupActions,
} from '@/lib/actions';

describe('public `disco` command', () => {
  it('bare `disco` shows a warning but does NOT arm an action', () => {
    const result = handleDisco([]);
    expect(result.action).toBeUndefined();
    expect(result.output).toBeTruthy();
  });

  it('`disco yes` arms the activation action', () => {
    const result = handleDisco(['yes']);
    expect(typeof result.action).toBe('function');
    expect(() => result.action?.()).not.toThrow();
  });

  it('`disco no` cancels without arming an action', () => {
    const result = handleDisco(['no']);
    expect(result.action).toBeUndefined();
    expect(result.output).toBeTruthy();
  });

  it('`disco off` arms the disengage action', () => {
    const result = handleDisco(['off']);
    expect(typeof result.action).toBe('function');
    expect(() => result.action?.()).not.toThrow();
  });
});

describe('chat themeAction: disco / disco-off', () => {
  it('VALID_THEME_ACTIONS includes disco and disco-off', () => {
    expect(VALID_THEME_ACTIONS).toContain('disco');
    expect(VALID_THEME_ACTIONS).toContain('disco-off');
  });

  it('ACTION_REGISTRY exposes disco engage + exit entries', () => {
    const labels = ACTION_REGISTRY.map(a => a.label);
    expect(labels).toContain(DISCO_ACTION_LABEL);
    expect(labels).toContain('Exit disco mode');
  });

  it('getActionFallbackReply returns a reply for disco / disco-off', () => {
    expect(getActionFallbackReply({ themeAction: 'disco' })).toMatch(/disco/i);
    expect(getActionFallbackReply({ themeAction: 'disco-off' })).toMatch(/exit/i);
  });

  it('promotes the disco chip into fresh initial chat suggestions', () => {
    const suggestions = getInitialChatSuggestions(false);
    expect(suggestions.base).toContain(DISCO_ACTION_LABEL);
  });

  it('does not suggest engaging disco while disco is already active', () => {
    const suggestions = getInitialChatSuggestions(true);
    expect(suggestions.base).not.toContain(DISCO_ACTION_LABEL);
    expect(getPromotedFollowupActions(getFollowupActions(), { discoActive: true })).not.toContain(DISCO_ACTION_LABEL);
  });

  it('orders disco first for follow-up action promotion when available', () => {
    const actions = getPromotedFollowupActions(getFollowupActions(), { discoActive: false });
    expect(actions[0]).toBe(DISCO_ACTION_LABEL);
  });
});
