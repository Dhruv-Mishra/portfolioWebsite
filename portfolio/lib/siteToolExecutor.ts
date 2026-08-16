import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { setSitePref, type SitePrefKey } from '@/hooks/useSitePrefs';
import { setSpeakByDefaultPref } from '@/lib/speakByDefaultPref';
import { requestPageTurnNavigation } from '@/lib/pageTurn';
import { APPROVED_LINKS, type SiteToolCall, type SiteToolResult } from '@/lib/siteTools';
import { parseSiteToolCall } from '@/lib/siteToolValidation';
import {
  browseHistory,
  buildProjectHref,
  requestOpenChat,
  requestCloseProject,
  requestOpenProject,
  requestOpenShortcuts,
  requestProjectVideoControl,
  requestRunTerminalCommand,
  requestSendChatMessage,
  requestSubmitFeedback,
  requestSubmitGuestbook,
  scrollRoutePage,
} from '@/lib/siteActionEvents';
import { soundManager } from '@/lib/soundManager';
import { runThemeSelection, runThemeToggle } from '@/lib/themeToggleAction';
import { setDiscoActiveImperative } from '@/hooks/useStickers';
import { setVoiceAgentPref } from '@/lib/voiceAgentPrefs';
import { setVoiceBackendPref } from '@/lib/voiceBackendPref';
import { setVoiceOutputPref } from '@/lib/voiceOutputPref';
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

async function lookupFacts(query: string): Promise<SiteToolResult> {
  try {
    const response = await fetch('/api/voice/facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) {
      return fail('I could not pull those facts just now.', 'facts-failed');
    }
    try {
      const payload = await response.json() as { spokenText?: string; data?: Record<string, unknown> };
      return ok(payload.spokenText || 'Let me fetch that from the sketchbook.', payload.data);
    } catch {
      return fail('I could not read those facts just now.', 'facts-invalid');
    }
  } catch {
    return fail('I could not pull those facts just now.', 'facts-failed');
  }
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
    case 'open_project': {
      const slug = parsed.args.slug;
      const nextAction = 'I can play, pause, mute, or unmute the preview if it has a video.';
      if (commit) {
        const hosted = requestOpenProject(slug);
        if (hosted.handled) {
          return hosted.result ?? ok('Queued that project to open.', { slug, accepted: true, nextAction });
        }
        requestPageTurnNavigation(runtime.router, { href: buildProjectHref(slug), mode: 'push' });
      }
      return ok('Opening that project.', {
        slug,
        accepted: true,
        nextAction,
      });
    }
    case 'close_project': {
      if (commit) {
        const hosted = requestCloseProject();
        if (hosted.handled) {
          if (hosted.result) return await Promise.resolve(hosted.result);
          return ok('Closing that project.');
        }
        return ok('That project is already closed.');
      }
      return ok('Closing that project.');
    }
    case 'control_project_video': {
      if (!commit) return fail('The preview is not ready yet.', 'project-video-unavailable');
      const hosted = requestProjectVideoControl(parsed.args.action);
      if (hosted.result) return await Promise.resolve(hosted.result);
      return fail('No project video is open right now.', 'project-video-unavailable');
    }
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
    case 'open_shortcuts':
      if (commit) requestOpenShortcuts();
      return ok('Opening keyboard shortcuts.');
    case 'open_chat':
      if (commit) {
        const handled = requestOpenChat();
        if (!handled) {
          requestPageTurnNavigation(runtime.router, { href: '/chat', mode: 'push' });
        }
      }
      return ok('Opening chat.', { nextAction: 'Want me to send a note once chat is ready?' });
    case 'browse_history':
      if (!commit) return ok(parsed.args.direction === 'back' ? 'Going back.' : 'Going forward.');
      return browseHistory(parsed.args.direction);
    case 'scroll_page':
      if (!commit) {
        return ok(parsed.args.direction === 'top'
          ? 'Scrolling to the top.'
          : parsed.args.direction === 'bottom'
            ? 'Scrolling to the bottom.'
            : parsed.args.direction === 'down'
              ? 'Scrolling down.'
              : 'Scrolling up.');
      }
      return scrollRoutePage(parsed.args.direction, parsed.args.amount ?? 0.9);
    case 'send_chat_message': {
      if (!commit) return ok('I will send that note.');
      const hosted = requestSendChatMessage(parsed.args.message);
      if (hosted.result) return hosted.result;
      return fail('Chat is not open right now.', 'chat-unavailable');
    }
    case 'run_terminal_command': {
      if (!commit) return ok(`I will run ${parsed.args.command}.`);
      const hosted = requestRunTerminalCommand(parsed.args.command);
      if (hosted.result) return hosted.result;
      return fail('The terminal is not open on this page.', 'terminal-unavailable');
    }
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
    case 'set_voice_output':
      setVoiceOutputPref(parsed.args.mode);
      return ok(parsed.args.mode === 'device' ? 'Replies will use device speech.' : 'Replies will use server speech.');
    case 'set_voice_backend':
      setVoiceBackendPref(parsed.args.backend);
      return ok(parsed.args.backend === 'whisper'
        ? 'Chat mic will use on-device Whisper.'
        : 'Chat mic will use native speech.');
    case 'set_motion_preference':
      setSitePref('motionPreference', parsed.args.motion);
      return ok(
        parsed.args.motion === 'reduced'
          ? 'Motion is reduced.'
          : parsed.args.motion === 'full'
            ? 'Motion will always animate.'
            : 'Motion will follow the device.',
      );
    case 'submit_guestbook': {
      if (!commit) return ok('I will pin that note.');
      const hosted = requestSubmitGuestbook({
        message: parsed.args.message,
        name: parsed.args.name,
      });
      if (hosted.result) return hosted.result;
      return fail('The guestbook is not open right now.', 'guestbook-unavailable');
    }
    case 'submit_feedback': {
      if (!commit) return ok('I will send that feedback.');
      const hosted = requestSubmitFeedback({
        message: parsed.args.message,
        contact: parsed.args.contact,
        category: parsed.args.category,
      });
      if (hosted.result) return hosted.result;
      return fail('Feedback is not open right now.', 'feedback-unavailable');
    }
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