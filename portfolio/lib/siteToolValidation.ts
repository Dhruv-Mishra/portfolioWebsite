import { VALID_NAVIGATION_PATHS, VALID_THEME_ACTIONS } from '@/lib/actions';
import { PROJECT_ACTIONS, type ProjectSlug } from '@/lib/projectCatalog';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  isApprovedLinkKey,
  isBrowseHistoryDirection,
  isFeedbackCategory,
  isMotionPreferenceValue,
  isPageScrollDirection,
  isProjectVideoAction,
  isSitePreferenceKey,
  isSiteToolName,
  isVoiceBackendMode,
  isVoiceFieldId,
  isVoiceOutputMode,
  resolveVoiceSafeTerminalCommand,
  PAGE_SCROLL_AMOUNT_DEFAULT,
  PAGE_SCROLL_AMOUNT_MAX,
  PAGE_SCROLL_AMOUNT_MIN,
  type SiteToolArgsMap,
  type SiteToolCall,
  type SiteToolName,
} from '@/lib/siteTools';

const NAV_SET = new Set<string>(VALID_NAVIGATION_PATHS);
const THEME_SET = new Set<string>(VALID_THEME_ACTIONS);
const SLUG_SET = new Set<string>(PROJECT_ACTIONS.map(project => project.slug));

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : null;
}

function readBoundedScrollAmount(record: Record<string, unknown>): number | null {
  if (record.amount === undefined) return PAGE_SCROLL_AMOUNT_DEFAULT;
  if (typeof record.amount !== 'number' || !Number.isFinite(record.amount)) return null;
  if (record.amount < PAGE_SCROLL_AMOUNT_MIN || record.amount > PAGE_SCROLL_AMOUNT_MAX) return null;
  return record.amount;
}

export function parseSiteToolCall(input: {
  id?: unknown;
  name?: unknown;
  args?: unknown;
}): SiteToolCall | null {
  if (!isSiteToolName(input.name)) return null;
  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : `tool-${input.name}`;
  const args = parseSiteToolArgs(input.name, input.args);
  if (!args) return null;
  return { id, name: input.name, args } as SiteToolCall;
}

export function parseSiteToolArgs<Name extends SiteToolName>(
  name: Name,
  raw: unknown,
): SiteToolArgsMap[Name] | null {
  const record = asRecord(raw) ?? {};

  switch (name) {
    case 'navigate_to': {
      const path = readString(record, 'path');
      if (!path || !NAV_SET.has(path)) return null;
      return { path } as SiteToolArgsMap[Name];
    }
    case 'set_theme': {
      const action = readString(record, 'action');
      if (!action || !THEME_SET.has(action)) return null;
      return { action } as SiteToolArgsMap[Name];
    }
    case 'open_project': {
      const slug = readString(record, 'slug');
      if (!slug || !SLUG_SET.has(slug)) return null;
      return { slug: slug as ProjectSlug } as SiteToolArgsMap[Name];
    }
    case 'control_project_video': {
      const action = readString(record, 'action');
      if (!action || !isProjectVideoAction(action)) return null;
      return { action } as SiteToolArgsMap[Name];
    }
    case 'open_link': {
      const key = readString(record, 'key');
      if (!key || !isApprovedLinkKey(key)) return null;
      return { key } as SiteToolArgsMap[Name];
    }
    case 'open_feedback':
    case 'open_command_palette':
    case 'open_shortcuts':
    case 'open_chat':
    case 'close_project':
    case 'start_voice_session':
      return {} as SiteToolArgsMap[Name];
    case 'browse_history': {
      const direction = readString(record, 'direction');
      if (!direction || !isBrowseHistoryDirection(direction)) return null;
      return { direction } as SiteToolArgsMap[Name];
    }
    case 'scroll_page': {
      const direction = readString(record, 'direction');
      const amount = readBoundedScrollAmount(record);
      if (!direction || !isPageScrollDirection(direction) || amount == null) return null;
      return { direction, amount } as SiteToolArgsMap[Name];
    }
    case 'send_chat_message': {
      const message = readString(record, 'message');
      if (!message || message.length > CHAT_MESSAGE_MAX_LENGTH) return null;
      return { message } as SiteToolArgsMap[Name];
    }
    case 'run_terminal_command': {
      const command = resolveVoiceSafeTerminalCommand(record);
      if (!command) return null;
      return { command } as SiteToolArgsMap[Name];
    }
    case 'fill_field': {
      const field = readString(record, 'field');
      const value = readString(record, 'value');
      if (!field || !isVoiceFieldId(field) || value == null || value.length === 0 || value.length > 1000) {
        return null;
      }
      if ('submit' in record) return null;
      return { field, value } as SiteToolArgsMap[Name];
    }
    case 'set_preference': {
      const key = readString(record, 'key');
      if (!key || !isSitePreferenceKey(key) || typeof record.enabled !== 'boolean') return null;
      return { key, enabled: record.enabled } as SiteToolArgsMap[Name];
    }
    case 'set_voice_output': {
      const mode = readString(record, 'mode');
      if (!mode || !isVoiceOutputMode(mode)) return null;
      return { mode } as SiteToolArgsMap[Name];
    }
    case 'set_voice_backend': {
      const backend = readString(record, 'backend');
      if (!backend || !isVoiceBackendMode(backend)) return null;
      return { backend } as SiteToolArgsMap[Name];
    }
    case 'set_motion_preference': {
      const motion = readString(record, 'motion');
      if (!motion || !isMotionPreferenceValue(motion)) return null;
      return { motion } as SiteToolArgsMap[Name];
    }
    case 'submit_guestbook': {
      const message = readString(record, 'message');
      const nameValue = readString(record, 'name') ?? undefined;
      if (!message || message.length < 5 || message.length > 300) return null;
      if (nameValue && (nameValue.length < 2 || nameValue.length > 40)) return null;
      if (/(?:https?:\/\/|www\.)/i.test(message) || (nameValue && /(?:https?:\/\/|www\.)/i.test(nameValue))) {
        return null;
      }
      return { message, name: nameValue } as SiteToolArgsMap[Name];
    }
    case 'submit_feedback': {
      const message = readString(record, 'message');
      const contactValue = readString(record, 'contact') ?? undefined;
      const categoryValue = record.category === undefined ? undefined : readString(record, 'category');
      if (!message || message.length < 5 || message.length > 1000) return null;
      if (contactValue && contactValue.length > 120) return null;
      if (categoryValue !== undefined && !isFeedbackCategory(categoryValue)) return null;
      return {
        message,
        contact: contactValue,
        category: categoryValue,
      } as SiteToolArgsMap[Name];
    }
    case 'lookup_site_facts': {
      const query = readString(record, 'query');
      if (!query || query.length > 240) return null;
      return { query } as SiteToolArgsMap[Name];
    }
    case 'end_voice_session': {
      const reason = readString(record, 'reason');
      if (reason && reason !== 'user' && reason !== 'health' && reason !== 'error') return null;
      return { reason: reason as 'user' | 'health' | 'error' | undefined } as SiteToolArgsMap[Name];
    }
    default:
      return null;
  }
}
