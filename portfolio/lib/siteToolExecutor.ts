import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { setSitePref, type SitePrefKey } from '@/hooks/useSitePrefs';
import { setSpeakByDefaultPref } from '@/lib/speakByDefaultPref';
import {
  APPROVED_LINKS,
  type AudioCategoryVolumeKey,
  type SiteToolCall,
  type SiteToolResult,
} from '@/lib/siteTools';
import { parseSiteToolCall } from '@/lib/siteToolValidation';
import {
  buildVoiceCurrentPageContext,
  expectedPageContextAfterCloseProject,
  expectedPageContextAfterNavigate,
  expectedPageContextAfterOpenProject,
  readAuthoritativePathname,
  withVoicePageContext,
} from '@/lib/voiceCurrentContext';
import { formatUserActionJournal } from '@/lib/userActionJournal';
import {
  browseHistory,
  buildProjectHref,
  requestOpenChat,
  requestCloseProject,
  requestOpenProject,
  requestOpenFeedback,
  requestOpenShortcuts,
  requestNextDiscoTrack,
  requestProjectVideoControl,
  requestRunTerminalCommand,
  requestSendChatMessage,
  requestSubmitFeedback,
  requestSubmitGuestbook,
  scrollRoutePage,
} from '@/lib/siteActionEvents';
import { commitUserMasterVolume, soundManager } from '@/lib/soundManager';
import { runDiscoMode, runThemeSelection, runThemeToggle } from '@/lib/themeToggleAction';
import {
  getAudioCategoryVolumeSync,
  getDiscoActiveSync,
  getMasterVolumeSync,
  getSoundsMutedSync,
  setAudioCategoryVolumeImperative,
  type AudioVolumeCategory,
} from '@/hooks/useStickers';
import { setVoiceAgentPref } from '@/lib/voiceAgentPrefs';
import { setVoiceBackendPref } from '@/lib/voiceBackendPref';
import { setVoiceOutputPref } from '@/lib/voiceOutputPref';
import { requestVoiceMode, requestVoiceModeExit } from '@/lib/voiceModeStore';

export interface SiteToolRuntime {
  router: AppRouterInstance;
  setTheme: (theme: 'light' | 'dark') => void;
  resolvedTheme?: string;
  discoActive: boolean;
  pathname?: string;
}

export interface ExecuteSiteToolOptions {
  /** When false, return spoken text without visual / navigation side effects. */
  commit?: boolean;
}

const PREF_KEY_MAP: Partial<Record<string, SitePrefKey>> = {
  haptics: 'hapticsEnabled',
  stickers: 'stickersEnabled',
  'sticker-toasts': 'stickerToastsEnabled',
  'paper-grain': 'paperGrain',
  tape: 'tapeEffects',
  'sketch-outlines': 'sketchOutlines',
};

const AUDIO_CATEGORY_STORE_MAP: Record<AudioCategoryVolumeKey, AudioVolumeCategory> = {
  'voice-agent': 'voiceAgent',
  'website-effects': 'siteSfx',
  'chat-read-aloud': 'chatTts',
};

function ok(spokenText: string, data?: Record<string, unknown>): SiteToolResult {
  return { ok: true, spokenText, data };
}

function fail(spokenText: string, errorCode: string): SiteToolResult {
  return { ok: false, spokenText, errorCode };
}

function livePathname(runtime: SiteToolRuntime): string | null {
  return readAuthoritativePathname(runtime.pathname);
}

function liveDiscoActive(runtime: SiteToolRuntime): boolean {
  try {
    return getDiscoActiveSync();
  } catch {
    return runtime.discoActive;
  }
}

function masterVolumePercent(): number {
  return Math.round(getMasterVolumeSync() * 100);
}

async function resolveHostedResult(
  hosted: { handled: boolean; result?: SiteToolResult | Promise<SiteToolResult> },
  fallback: SiteToolResult,
): Promise<SiteToolResult> {
  if (hosted.result) {
    try {
      return await Promise.resolve(hosted.result);
    } catch {
      return fail('That action could not finish just now.', 'host-action-failed');
    }
  }
  return fallback;
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

  if (typeof document === 'undefined') {
    return fail('That field is only available in the browser.', 'no-window');
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
    case 'navigate_to': {
      const current = buildVoiceCurrentPageContext({ runtime });
      if (livePathname(runtime) === parsed.args.path) {
        return withVoicePageContext(ok("You're already here."), current);
      }
      if (commit) {
        runtime.router.push(parsed.args.path);
      }
      return withVoicePageContext(
        ok('Taking you there.'),
        expectedPageContextAfterNavigate(parsed.args.path, current),
      );
    }
    case 'set_theme': {
      const discoActive = liveDiscoActive(runtime);
      const isDark = runtime.resolvedTheme === 'dark';
      if (parsed.args.action === 'disco' && discoActive) {
        return ok('Disco is already on.');
      }
      if (parsed.args.action === 'disco-off' && !discoActive) {
        return ok('Disco is already off.');
      }
      if (parsed.args.action === 'dark' && !discoActive && isDark) {
        return ok('Already on dark mode.');
      }
      if (parsed.args.action === 'light' && !discoActive && runtime.resolvedTheme === 'light') {
        return ok('Already on light mode.');
      }
      if (commit) {
        if (parsed.args.action === 'toggle') {
          runThemeToggle({
            discoActive,
            isDark,
            setTheme: runtime.setTheme,
          });
        } else if (parsed.args.action === 'disco') {
          runDiscoMode(true);
        } else if (parsed.args.action === 'disco-off') {
          runDiscoMode(false);
        } else {
          runThemeSelection({
            discoActive,
            theme: parsed.args.action,
            setTheme: runtime.setTheme as (theme: 'system' | 'light' | 'dark') => void,
          });
        }
      }
      return ok('Updated the look.');
    }
    case 'open_project': {
      const slug = parsed.args.slug;
      const nextAction = 'I can play, pause, mute, or unmute the preview if it has a video.';
      const pageContext = expectedPageContextAfterOpenProject(
        slug,
        buildVoiceCurrentPageContext({ runtime }),
      );
      if (commit) {
        const hosted = requestOpenProject(slug);
        if (hosted.handled) {
          return withVoicePageContext(
            await resolveHostedResult(
              hosted,
              ok('Queued that project to open.', { slug, accepted: true, nextAction }),
            ),
            pageContext,
          );
        }
        runtime.router.push(buildProjectHref(slug));
      }
      return withVoicePageContext(
        ok('Opening that project.', {
          slug,
          accepted: true,
          nextAction,
        }),
        pageContext,
      );
    }
    case 'close_project': {
      const pageContext = expectedPageContextAfterCloseProject(
        buildVoiceCurrentPageContext({ runtime }),
      );
      if (commit) {
        const hosted = requestCloseProject();
        if (hosted.handled) {
          return withVoicePageContext(
            await resolveHostedResult(hosted, ok('Closing that project.')),
            pageContext,
          );
        }
        return withVoicePageContext(ok('That project is already closed.'), pageContext);
      }
      return withVoicePageContext(ok('Closing that project.'), pageContext);
    }
    case 'control_project_video': {
      if (!commit) return fail('The preview is not ready yet.', 'project-video-unavailable');
      const hosted = requestProjectVideoControl(parsed.args.action);
      return resolveHostedResult(
        hosted,
        fail('No project video is open right now.', 'project-video-unavailable'),
      );
    }
    case 'open_link': {
      const url = APPROVED_LINKS[parsed.args.key];
      if (commit) window.open(url, '_blank', 'noopener,noreferrer');
      return ok('Opening that link.');
    }
    case 'open_feedback':
      if (commit) requestOpenFeedback();
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
          runtime.router.push('/chat');
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
      if (hosted.handled) {
        return resolveHostedResult(hosted, fail('Chat is not open right now.', 'chat-unavailable'));
      }
      return fail('Chat is not open right now.', 'chat-unavailable');
    }
    case 'run_terminal_command': {
      if (!commit) return ok(`I will run ${parsed.args.command}.`);
      const hosted = requestRunTerminalCommand(parsed.args.command);
      if (hosted.handled) {
        return resolveHostedResult(
          hosted,
          fail('The terminal is not open on this page.', 'terminal-unavailable'),
        );
      }
      return fail('The terminal is not open on this page.', 'terminal-unavailable');
    }
    case 'fill_field':
      return fillField(parsed.args.field, parsed.args.value);
    case 'set_preference': {
      if (parsed.args.key === 'sound-effects') {
        const muted = getSoundsMutedSync();
        if (parsed.args.enabled && !muted) return ok('Sound effects are already on.');
        if (!parsed.args.enabled && muted) return ok('Sound effects are already off.');
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
      const mapped = PREF_KEY_MAP[parsed.args.key];
      if (!mapped) return fail('That preference is not available.', 'unknown-pref');
      setSitePref(mapped, parsed.args.enabled);
      return ok(parsed.args.enabled ? 'Turned that on.' : 'Turned that off.');
    }
    case 'set_master_volume': {
      const percent = parsed.args.percent;
      if (masterVolumePercent() === percent) {
        return ok(`Volume is already at ${percent} percent.`, { percent, alreadySet: true });
      }
      commitUserMasterVolume(percent / 100);
      return ok(`Volume is at ${percent} percent.`, { percent });
    }
    case 'set_audio_category_volume': {
      const { category, percent } = parsed.args;
      const storeCategory = AUDIO_CATEGORY_STORE_MAP[category];
      const volume = percent / 100;
      if (getAudioCategoryVolumeSync(storeCategory) === volume) {
        return ok(`${category} volume is already at ${percent} percent.`, { category, percent, alreadySet: true });
      }
      setAudioCategoryVolumeImperative(storeCategory, volume);
      return ok(`${category} volume is at ${percent} percent.`, { category, percent });
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
      if (hosted.handled) {
        return resolveHostedResult(
          hosted,
          fail('The guestbook is not open right now.', 'guestbook-unavailable'),
        );
      }
      return fail('The guestbook is not open right now.', 'guestbook-unavailable');
    }
    case 'submit_feedback': {
      if (!commit) return ok('I will send that feedback.');
      const hosted = requestSubmitFeedback({
        message: parsed.args.message,
        contact: parsed.args.contact,
        category: parsed.args.category,
      });
      if (hosted.handled) {
        return resolveHostedResult(
          hosted,
          fail('Feedback is not open right now.', 'feedback-unavailable'),
        );
      }
      return fail('Feedback is not open right now.', 'feedback-unavailable');
    }
    case 'lookup_site_facts':
      return lookupFacts(parsed.args.query);
    case 'get_recent_user_context': {
      const pageContext = buildVoiceCurrentPageContext({ runtime });
      if (!pageContext) {
        return fail('I could not read this page just now.', 'page-context-unavailable');
      }
      const recentActions = formatUserActionJournal();
      return ok('Here is the recent user context.', { pageContext, recentActions });
    }
    case 'start_voice_session':
      if (commit) requestVoiceMode({ source: 'tool' });
      return ok('Switching to voice mode.');
    case 'end_voice_session':
      if (commit) requestVoiceModeExit(parsed.args.reason ?? 'user');
      return ok('Leaving voice mode.');
    case 'next_disco_track': {
      if (!liveDiscoActive(runtime)) {
        return fail('Disco is not on right now.', 'disco-inactive');
      }
      if (!commit) return ok('Skipping to the next disco track.');
      const hosted = requestNextDiscoTrack();
      return resolveHostedResult(
        hosted,
        fail('Disco track controls are not ready.', 'disco-track-unavailable'),
      );
    }
    default:
      return fail('That tool is not available.', 'unknown-tool');
  }
}
