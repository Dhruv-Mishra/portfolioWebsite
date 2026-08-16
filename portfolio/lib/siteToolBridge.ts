import type { ActionExecution } from '@/lib/actions';
import { APPROVED_LINKS, type SiteToolCall, type SiteToolName } from '@/lib/siteTools';

export function actionFromSiteTool(call: SiteToolCall): ActionExecution | null {
  switch (call.name) {
    case 'navigate_to':
      return { navigateTo: call.args.path };
    case 'set_theme':
      return { themeAction: call.args.action };
    case 'open_project':
      return { projectSlug: call.args.slug };
    case 'open_link':
      return { openUrls: [APPROVED_LINKS[call.args.key]] };
    case 'open_feedback':
      return { feedbackAction: true };
    case 'open_command_palette':
      return { commandPaletteAction: true };
    case 'open_chat':
      return { navigateTo: '/chat' };
    case 'fill_field':
      return { fieldFill: call.args };
    case 'set_preference':
      return { preferenceAction: call.args };
    case 'submit_guestbook':
      return { guestbookSubmit: call.args };
    case 'start_voice_session':
      return { voiceSessionAction: true };
    case 'lookup_site_facts':
    case 'end_voice_session':
    case 'close_project':
    case 'control_project_video':
    case 'open_shortcuts':
    case 'browse_history':
    case 'scroll_page':
    case 'send_chat_message':
    case 'run_terminal_command':
    case 'set_voice_output':
    case 'set_voice_backend':
    case 'set_motion_preference':
    case 'submit_feedback':
      return null;
    default:
      return null;
  }
}

export function siteToolNameFromAction(action: ActionExecution): SiteToolName | null {
  if (action.navigateTo) return 'navigate_to';
  if (action.themeAction) return 'set_theme';
  if (action.projectSlug) return 'open_project';
  if (action.openUrls?.length) return 'open_link';
  if (action.feedbackAction) return 'open_feedback';
  if (action.commandPaletteAction) return 'open_command_palette';
  if (action.fieldFill) return 'fill_field';
  if (action.preferenceAction) return 'set_preference';
  if (action.guestbookSubmit) return 'submit_guestbook';
  if (action.voiceSessionAction) return 'start_voice_session';
  return null;
}
