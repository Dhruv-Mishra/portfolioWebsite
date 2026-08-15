import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { setSitePref, type SitePrefKey } from '@/hooks/useSitePrefs';
import { setSpeakByDefaultPref } from '@/lib/speakByDefaultPref';
import { GUESTBOOK_LIMITS } from '@/lib/designTokens';
import { requestPageTurnNavigation } from '@/lib/pageTurn';
import { APPROVED_LINKS, type SiteToolCall, type SiteToolResult } from '@/lib/siteTools';
import { parseSiteToolCall } from '@/lib/siteToolValidation';
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

export interface ExecuteSiteToolOptions {
  /** When false, return spoken text without visual / navigation side effects. */
  commit?: boolean;
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

function fillField(field: string, value: string): SiteToolResult {
  if (typeof window === 'undefined') {
    return fail('That field is only available in the browser.', 'no-window');
  }

  const event = new CustomEvent('voice-fill-field', {
    detail: { field, value },
    cancelable: true,
  });
  window.dispatchEvent(event);
  if (event.defaultPrevented) {
    return ok('Typed that in.');
  }

  const target = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[data-voice-field="${field}"]`,
  );

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
  return ok('Typed that in.');
}

function draftGuestbook(message: string, name?: string): SiteToolResult {
  const trimmedMessage = message.trim();
  if (trimmedMessage.length < GUESTBOOK_LIMITS.minMessageLength) {
    return fail('That note is too short to pin.', 'guestbook-short');
  }
  if (/(?:https?:\/\/|www\.)/i.test(trimmedMessage) || (name && /(?:https?:\/\/|www\.)/i.test(name))) {
    return fail('I will not pin a note that looks like a link.', 'guestbook-url');
  }

  const messageResult = fillField('guestbook-message', trimmedMessage);
  if (!messageResult.ok) return messageResult;
  if (name?.trim()) {
    const nameResult = fillField('guestbook-name', name.trim());
    if (!nameResult.ok) return nameResult;
  }
  return ok('I typed the note. Pin it when you want it on the wall.');
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
  options: ExecuteSiteToolOptions = {},
): Promise<SiteToolResult> {
  const parsed = parseSiteToolCall(call);
  if (!parsed) return fail('That action is not available.', 'invalid-tool');
  const commit = options.commit !== false;

  switch (parsed.name) {
    case 'navigate_to':
      if (commit) {
        requestPageTurnNavigation(runtime.router, { href: parsed.args.path, mode: 'push' });
      }
      return ok('Taking you there.');
    case 'set_theme':
      if (commit) {
        if (parsed.args.action === 'toggle') {
          runThemeToggle({
            discoActive: runtime.discoActive,
            isDark: runtime.resolvedTheme === 'dark',
            setTheme: runtime.setTheme,
          });
        } else if (parsed.args.action === 'disco') {
          setDiscoActiveImperative(true);
        } else if (parsed.args.action === 'disco-off') {
          setDiscoActiveImperative(false);
        } else {
          runThemeSelection({
            discoActive: runtime.discoActive,
            theme: parsed.args.action,
            setTheme: runtime.setTheme as (theme: 'system' | 'light' | 'dark') => void,
          });
        }
      }
      return ok('Updated the look.');
    case 'open_project':
      if (commit) runtime.openProject(parsed.args.slug);
      return ok('Opening that project.');
    case 'open_link': {
      const url = APPROVED_LINKS[parsed.args.key];
      if (commit) window.open(url, '_blank', 'noopener,noreferrer');
      return ok('Opening that link.');
    }
    case 'open_feedback':
      if (commit) {
        runtime.openFeedback();
        window.dispatchEvent(new CustomEvent('open-feedback'));
      }
      return ok('Opening the feedback note.');
    case 'open_command_palette':
      if (commit) window.dispatchEvent(new CustomEvent('open-command-palette'));
      return ok('Opening the command palette.');
    case 'fill_field':
      return fillField(parsed.args.field, parsed.args.value);
    case 'set_preference': {
      if (parsed.args.key === 'sound-effects') {
        const { setSoundsMutedImperative } = await import('@/hooks/useStickers');
        setSoundsMutedImperative(!parsed.args.enabled);
        soundManager.setMuted(!parsed.args.enabled);
        return ok(parsed.args.enabled ? 'Sound effects are on.' : 'Sound effects are off.');
      }
      if (parsed.args.key === 'speak-by-default') {
        setSpeakByDefaultPref(parsed.args.enabled);
        return ok(parsed.args.enabled ? 'I will speak replies by default.' : 'I will stay quiet unless asked.');
      }
      if (parsed.args.key === 'voice-low-network') {
        setVoiceAgentPref('lowNetwork', parsed.args.enabled);
        return ok(parsed.args.enabled ? 'Low-network voice mode is on.' : 'Low-network voice mode is off.');
      }
      if (parsed.args.key === 'voice-ambient-music') {
        setVoiceAgentPref('ambientMusic', parsed.args.enabled);
        return ok(parsed.args.enabled ? 'Ambient music is on.' : 'Ambient music is off.');
      }
      const mapped = PREF_KEY_MAP[parsed.args.key];
      if (!mapped) return fail('That preference is not available.', 'unknown-pref');
      setSitePref(mapped, parsed.args.enabled);
      return ok(parsed.args.enabled ? 'Turned that on.' : 'Turned that off.');
    }
    case 'submit_guestbook':
      return draftGuestbook(parsed.args.message, parsed.args.name);
    case 'lookup_site_facts':
      return lookupFacts(parsed.args.query);
    case 'start_voice_session':
      if (commit) requestVoiceMode();
      return ok('Switching to voice mode.');
    case 'end_voice_session':
      if (commit) requestVoiceModeExit(parsed.args.reason ?? 'user');
      return ok('Leaving voice mode.');
    default:
      return fail('That tool is not available.', 'unknown-tool');
  }
}
