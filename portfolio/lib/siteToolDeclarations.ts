import { VALID_NAVIGATION_PATHS, VALID_THEME_ACTIONS } from '@/lib/actions';
import {
  APPROVED_LINK_KEYS,
  BROWSE_HISTORY_DIRECTIONS,
  FEEDBACK_CATEGORIES,
  MASTER_VOLUME_PERCENT_MAX,
  MASTER_VOLUME_PERCENT_MIN,
  MOTION_PREFERENCE_VALUES,
  PAGE_SCROLL_AMOUNT_DEFAULT,
  PAGE_SCROLL_AMOUNT_MAX,
  PAGE_SCROLL_AMOUNT_MIN,
  PAGE_SCROLL_DIRECTIONS,
  PROJECT_SLUGS,
  PROJECT_VIDEO_ACTIONS,
  SITE_PREFERENCE_KEYS,
  SITE_TOOL_NAMES,
  VOICE_BACKEND_MODES,
  VOICE_FIELD_IDS,
  VOICE_OUTPUT_MODES,
  VOICE_SAFE_TERMINAL_COMMANDS,
  type SiteToolName,
} from '@/lib/siteTools';

export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface SiteToolDeclaration {
  name: SiteToolName;
  description: string;
  parameters: JsonSchemaObject;
}

export const SITE_TOOL_DECLARATIONS: SiteToolDeclaration[] = [
  {
    name: 'navigate_to',
    description:
      'Open an internal page. Invocation: visitor asks to go somewhere on this site. Paths: / /about /projects /resume /chat /guestbook /stickers /settings.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', enum: [...VALID_NAVIGATION_PATHS] },
      },
      required: ['path'],
    },
  },
  {
    name: 'set_theme',
    description:
      'Change appearance. Invocation: visitor asks for dark, light, toggle, disco, or disco off.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...VALID_THEME_ACTIONS] },
      },
      required: ['action'],
    },
  },
  {
    name: 'open_project',
    description:
      'Open a project modal after navigating to /projects. Invocation: visitor asks to show or open a specific project. After success, you can offer video play/pause/mute if that project has a preview.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', enum: [...PROJECT_SLUGS] },
      },
      required: ['slug'],
    },
  },
  {
    name: 'close_project',
    description:
      'Close the open project modal. Invocation: visitor asks to close, dismiss, or hide the current project, modal, note, or preview.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'control_project_video',
    description:
      'Control the open project preview video. Invocation: visitor asks to play, pause, mute, or unmute the current project video. Fails if no modal or video is open.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...PROJECT_VIDEO_ACTIONS] },
      },
      required: ['action'],
    },
  },
  {
    name: 'open_link',
    description:
      'Open an approved external link. Invocation: visitor asks for GitHub, LinkedIn, resume PDF, a repo, email, or phone.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', enum: [...APPROVED_LINK_KEYS] },
      },
      required: ['key'],
    },
  },
  {
    name: 'open_feedback',
    description: 'Open the feedback note. Invocation: visitor wants to report a bug or leave feedback.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'open_command_palette',
    description: 'Open the command palette. Invocation: visitor asks for quick actions or the command menu.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'open_shortcuts',
    description: 'Open the keyboard shortcuts overlay. Invocation: visitor asks for hotkeys or keyboard help.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'open_chat',
    description:
      'Open the on-page chat composer. Invocation: visitor wants to type or send a chat note. On /chat this is already open; elsewhere it opens quick chat.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'browse_history',
    description: 'Go back or forward in browser history. Invocation: visitor says go back or go forward.',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: [...BROWSE_HISTORY_DIRECTIONS] },
      },
      required: ['direction'],
    },
  },
  {
    name: 'scroll_page',
    description:
      'Scroll the current page container. Invocation: visitor asks to scroll up, down, to the top, or to the bottom. Amount is viewport heights, default 0.9, max 3.',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: [...PAGE_SCROLL_DIRECTIONS] },
        amount: {
          type: 'number',
          minimum: PAGE_SCROLL_AMOUNT_MIN,
          maximum: PAGE_SCROLL_AMOUNT_MAX,
          description: `Viewport heights for up/down. Default ${PAGE_SCROLL_AMOUNT_DEFAULT}.`,
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'send_chat_message',
    description:
      'Send a chat note through the real chat composer. Invocation: visitor dictates a chat message and wants it sent now. Fails if chat is not mounted or busy. Does not clear history.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Exact chat note to send. Max 500 characters.' },
      },
      required: ['message'],
    },
  },
  {
    name: 'run_terminal_command',
    description:
      'Run one allowlisted bare terminal command with no arguments, including hint. Never sudo, admin, puzzle, matrix, clear, or commands with arguments.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: [...VOICE_SAFE_TERMINAL_COMMANDS] },
      },
      required: ['command'],
    },
  },
  {
    name: 'fill_field',
    description:
      'Type into a visible site field. Invocation: visitor dictates guestbook, feedback, palette, terminal, or chat text. Never submit the form.',
    parameters: {
      type: 'object',
      properties: {
        field: { type: 'string', enum: [...VOICE_FIELD_IDS] },
        value: { type: 'string', description: 'Exact text to insert.' },
      },
      required: ['field', 'value'],
    },
  },
  {
    name: 'set_preference',
    description:
      'Flip a boolean settings toggle. Invocation: visitor asks to change sound, haptics, stickers, immersion, speak-by-default, or voice extras. Does not clear chat, enable experimental features, or activate staging.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', enum: [...SITE_PREFERENCE_KEYS] },
        enabled: { type: 'boolean' },
      },
      required: ['key', 'enabled'],
    },
  },
  {
    name: 'set_master_volume',
    description:
      'Set sitewide master volume from 0 to 100. Invocation: visitor asks to turn volume up, down, mute-level quiet, or a specific percent. Independent of the sound-effects mute toggle.',
    parameters: {
      type: 'object',
      properties: {
        percent: {
          type: 'integer',
          minimum: MASTER_VOLUME_PERCENT_MIN,
          maximum: MASTER_VOLUME_PERCENT_MAX,
          description: 'Master volume percent from 0 to 100.',
        },
      },
      required: ['percent'],
    },
  },
  {
    name: 'set_voice_output',
    description:
      'Choose spoken-reply output. Invocation: visitor asks for device TTS or server custom speech.',
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: [...VOICE_OUTPUT_MODES] },
      },
      required: ['mode'],
    },
  },
  {
    name: 'set_voice_backend',
    description:
      'Choose chat mic transcription. Invocation: visitor asks for native browser speech or on-device Whisper. Whisper may download a model.',
    parameters: {
      type: 'object',
      properties: {
        backend: { type: 'string', enum: [...VOICE_BACKEND_MODES] },
      },
      required: ['backend'],
    },
  },
  {
    name: 'set_motion_preference',
    description:
      'Set motion preference. Invocation: visitor asks to follow the device, reduce motion, or always animate.',
    parameters: {
      type: 'object',
      properties: {
        motion: { type: 'string', enum: [...MOTION_PREFERENCE_VALUES] },
      },
      required: ['motion'],
    },
  },
  {
    name: 'submit_guestbook',
    description:
      'Pin a guestbook note. Invocation: only after the visitor dictated the note and confirmed they want it posted.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['message'],
    },
  },
  {
    name: 'submit_feedback',
    description:
      'Send the open feedback note. Invocation: only after the visitor dictated the note and confirmed they want it sent.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Exact feedback note to send. At least 5 characters, max 1000.' },
        contact: { type: 'string', description: 'Optional name, email, or socials. Max 120 characters.' },
        category: { type: 'string', enum: [...FEEDBACK_CATEGORIES] },
      },
      required: ['message'],
    },
  },
  {
    name: 'lookup_site_facts',
    description:
      'Fetch a tiny fact snippet about Dhruv or the site. Invocation: before answering biographical, project, or site questions. Keep queries short.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_current_page_context',
    description:
      'Read the current allowlisted page. Invocation: before page-dependent answers or actions, or after the visitor may have moved. Trust this over session context. Returns route, topic, theme, disco, muted, volume, and open project only.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'start_voice_session',
    description: 'Enter native voice mode. Invocation: visitor asks to talk by voice. Chat only.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'end_voice_session',
    description: 'Leave voice mode gracefully. Invocation: visitor says goodbye, hang up, or exit voice.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', enum: ['user', 'health', 'error'] },
      },
    },
  },
];

export const VOICE_LIVE_TOOL_DECLARATIONS: SiteToolDeclaration[] =
  SITE_TOOL_DECLARATIONS.filter(tool => tool.name !== 'start_voice_session');

export function getSiteToolDeclaration(name: SiteToolName): SiteToolDeclaration {
  const declaration = SITE_TOOL_DECLARATIONS.find(entry => entry.name === name);
  if (!declaration) {
    throw new Error(`Missing site tool declaration: ${name}`);
  }
  return declaration;
}

export function assertCompleteToolCatalog(): void {
  for (const name of SITE_TOOL_NAMES) {
    getSiteToolDeclaration(name);
  }
}
