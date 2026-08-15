import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { setSitePref, type SitePrefKey } from '@/hooks/useSitePrefs';
import { setSpeakByDefaultPref } from '@/lib/speakByDefaultPref';
import { GUESTBOOK_LIMITS } from '@/lib/designTokens';
import { addPendingGuestbookEntry } from '@/lib/guestbookPending';
import { requestPageTurnNavigation } from '@/lib/pageTurn';
import { APPROVED_LINKS, type SiteToolCall, type SiteToolResult } from '@/lib/siteTools';
import { soundManager } from '@/lib/soundManager';
import { runThemeSelection, runThemeToggle } from '@/lib/themeToggleAction';
import { setDiscoActiveImperative } from '@/hooks/useStickers';
import { setVoiceAgentPref } from '@/lib/voiceAgentPrefs';
import { requestVoiceMode, requestVoiceModeExit } from '@/lib/voiceModeStore';

export interface SiteToolRuntime {
  router: AppRouterInstance;
  setTheme: (theme: 'light' | 'dark') => void;
  resolvedTheme?: string;
  discoActive: boolean;
  openFeedback: () => void;
  openProject: (slug: string) => void;
}

const PREF_KEY_MAP: Partial<Record<string, SitePrefKey>> = {
  haptics: 'hapticsEnabled',
  'enhance-immersion': 'enhanceImmersion',
  stickers: 'stickersEnabled',
  'sticker-toasts': 'stickerToastsEnabled',
  'paper-grain': 'paperGrain',
  tape: 'tapeEffects',
  'sketch-outlines': 'sketchOutlines',
};

function ok(spokenText: string, data?: Record<string, unknown>): SiteToolResult {
  return { ok: true, spokenText, data };
}

function fail(spokenText: string, errorCode: string): SiteToolResult {
  return { ok: false, spokenText, errorCode };
}

function fillField(field: string, value: string, submit?: boolean): SiteToolResult {
  if (typeof window === 'undefined') {
    return fail('That field is only available in the browser.', 'no-window');
  }

  const event = new CustomEvent('voice-fill-field', {
    detail: { field, value, submit: submit === true },
    cancelable: true,
  });
  window.dispatchEvent(event);
  if (event.defaultPrevented) {
    return ok(submit ? 'Typed that in and sent it.' : 'Typed that in.');
  }

  const selectors = [
    `[data-voice-field="${field}"]`,
    `#${field}`,
    `textarea[name="${field}"]`,
    `input[name="${field}"]`,
  ];
  const target = selectors
    .map(selector => document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector))
    .find(Boolean);

  if (!target) {
    return fail('I could not find that field on this page.', 'missing-field');
  }

  const proto = target instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor?.set?.call(target, value);
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  if (submit) {
    target.form?.requestSubmit();
  }
  return ok(submit ? 'Typed that in and sent it.' : 'Typed that in.');
}

async function submitGuestbook(message: string, name?: string): Promise<SiteToolResult> {
  const trimmedMessage = message.trim();
  if (trimmedMessage.length < GUESTBOOK_LIMITS.minMessageLength) {
    return fail('That note is too short to pin.', 'guestbook-short');
  }

  const trimmedName = name?.trim();
  const response = await fetch('/api/guestbook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: trimmedMessage,
      name: trimmedName || undefined,
      website: '',
    }),
  });

  if (!response.ok) {
    return fail('The guestbook pin slipped. Try again in a moment.', 'guestbook-failed');
  }

  addPendingGuestbookEntry({ message: trimmedMessage, name: trimmedName ?? '' });
  return ok('Pinned that guestbook note.');
}

async function lookupFacts(query: string): Promise<SiteToolResult> {
  const response = await fetch('/api/voice/facts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    return fail('I could not pull those facts just now.', 'facts-failed');
  }
  const payload = await response.json() as { spokenText?: string; data?: Record<string, unknown> };
  return ok(payload.spokenText || 'No compact facts matched that question.', payload.data);
}

export async function executeSiteTool(
  call: SiteToolCall,
  runtime: SiteToolRuntime,
): Promise<SiteToolResult> {
  switch (call.name) {
    case 'navigate_to':
      requestPageTurnNavigation(runtime.router, { href: call.args.path, mode: 'push' });
      return ok('Taking you there.');
    case 'set_theme':
      if (call.args.action === 'toggle') {
        runThemeToggle({
          discoActive: runtime.discoActive,
          isDark: runtime.resolvedTheme === 'dark',
          setTheme: runtime.setTheme,
        });
      } else if (call.args.action === 'disco') {
        setDiscoActiveImperative(true);
      } else if (call.args.action === 'disco-off') {
        setDiscoActiveImperative(false);
      } else {
        runThemeSelection({
          discoActive: runtime.discoActive,
          theme: call.args.action,
          setTheme: runtime.setTheme as (theme: 'system' | 'light' | 'dark') => void,
        });
      }
      return ok('Updated the look.');
    case 'open_project':
      runtime.openProject(call.args.slug);
      return ok('Opening that project.');
    case 'open_link': {
      const url = APPROVED_LINKS[call.args.key];
      window.open(url, '_blank', 'noopener,noreferrer');
      return ok('Opening that link.');
    }
    case 'open_feedback':
      runtime.openFeedback();
      window.dispatchEvent(new CustomEvent('open-feedback'));
      return ok('Opening the feedback note.');
    case 'open_command_palette':
      window.dispatchEvent(new CustomEvent('open-command-palette'));
      return ok('Opening the command palette.');
    case 'fill_field':
      return fillField(call.args.field, call.args.value, call.args.submit);
    case 'set_preference': {
      if (call.args.key === 'sound-effects') {
        const { setSoundsMutedImperative } = await import('@/hooks/useStickers');
        setSoundsMutedImperative(!call.args.enabled);
        soundManager.setMuted(!call.args.enabled);
        return ok(call.args.enabled ? 'Sound effects are on.' : 'Sound effects are off.');
      }
      if (call.args.key === 'speak-by-default') {
        setSpeakByDefaultPref(call.args.enabled);
        return ok(call.args.enabled ? 'I will speak replies by default.' : 'I will stay quiet unless asked.');
      }
      if (call.args.key === 'voice-low-network') {
        setVoiceAgentPref('lowNetwork', call.args.enabled);
        return ok(call.args.enabled ? 'Low-network voice mode is on.' : 'Low-network voice mode is off.');
      }
      if (call.args.key === 'voice-ambient-music') {
        setVoiceAgentPref('ambientMusic', call.args.enabled);
        return ok(call.args.enabled ? 'Ambient music is on.' : 'Ambient music is off.');
      }
      const mapped = PREF_KEY_MAP[call.args.key];
      if (!mapped) return fail('That preference is not available.', 'unknown-pref');
      setSitePref(mapped, call.args.enabled);
      return ok(call.args.enabled ? 'Turned that on.' : 'Turned that off.');
    }
    case 'submit_guestbook':
      return submitGuestbook(call.args.message, call.args.name);
    case 'lookup_site_facts':
      return lookupFacts(call.args.query);
    case 'start_voice_session':
      requestVoiceMode();
      return ok('Switching to voice mode.');
    case 'end_voice_session':
      requestVoiceModeExit(call.args.reason ?? 'user');
      return ok('Leaving voice mode.');
    default:
      return fail('That tool is not available.', 'unknown-tool');
  }
}
