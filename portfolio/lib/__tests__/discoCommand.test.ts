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
  resolveExactActionLabel,
} from '@/lib/actions';
import { getCannedSuggestionTexts, getSuggestionResponse } from '@/lib/suggestionResponses';

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

  it('resolves exact action chips on the client without chat API routing', () => {
    expect(resolveExactActionLabel(DISCO_ACTION_LABEL)?.themeAction).toBe('disco');
    expect(resolveExactActionLabel('Exit disco mode')?.themeAction).toBe('disco-off');
    expect(resolveExactActionLabel('Report a bug')?.feedbackAction).toBe(true);
    expect(resolveExactActionLabel('Show me Jarvis Voice Agent')?.projectSlug).toBe('jarvis-voice-agent');
    expect(resolveExactActionLabel('Open your GitHub profile')?.openUrls?.[0]).toContain('github.com/Dhruv-Mishra');
    expect(resolveExactActionLabel('What do you work on at Microsoft?')).toBeNull();
  });

  it('keeps every non-action hardcoded suggestion answerable on the client', () => {
    const exactActions = new Set(ACTION_REGISTRY.map(action => action.label));
    const canned = new Set(getCannedSuggestionTexts());
    const hardcodedSuggestions = new Set([
      ...getInitialChatSuggestions(false).base,
      ...getInitialChatSuggestions(false).extra,
      ...getInitialChatSuggestions(true).base,
      ...getInitialChatSuggestions(true).extra,
      ...getFollowupActions(),
    ]);

    for (const suggestion of hardcodedSuggestions) {
      expect(
        exactActions.has(suggestion) || canned.has(suggestion),
        `"${suggestion}" should resolve as either a local action or canned local reply`,
      ).toBe(true);
    }

    for (const text of canned) {
      expect(getSuggestionResponse(text), `"${text}" should have a non-empty canned response`).toEqual(expect.any(String));
    }
  });
});
