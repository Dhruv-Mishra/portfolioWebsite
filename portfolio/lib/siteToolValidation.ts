import { VALID_NAVIGATION_PATHS, VALID_THEME_ACTIONS } from '@/lib/actions';
import { PROJECT_ACTIONS, type ProjectSlug } from '@/lib/projectCatalog';
import {
  isApprovedLinkKey,
  isSitePreferenceKey,
  isSiteToolName,
  isVoiceFieldId,
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
    case 'open_link': {
      const key = readString(record, 'key');
      if (!key || !isApprovedLinkKey(key)) return null;
      return { key } as SiteToolArgsMap[Name];
    }
    case 'open_feedback':
    case 'open_command_palette':
    case 'start_voice_session':
      return {} as SiteToolArgsMap[Name];
    case 'fill_field': {
      const field = readString(record, 'field');
      const value = readString(record, 'value');
      if (!field || !isVoiceFieldId(field) || value == null || value.length === 0 || value.length > 1000) {
        return null;
      }
      if (record.submit === true) return null;
      return { field, value } as SiteToolArgsMap[Name];
    }
    case 'set_preference': {
      const key = readString(record, 'key');
      if (!key || !isSitePreferenceKey(key) || typeof record.enabled !== 'boolean') return null;
      return { key, enabled: record.enabled } as SiteToolArgsMap[Name];
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
