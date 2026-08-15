import { VALID_NAVIGATION_PATHS, VALID_THEME_ACTIONS } from '@/lib/actions';
import {
  APPROVED_LINK_KEYS,
  PROJECT_SLUGS,
  SITE_PREFERENCE_KEYS,
  SITE_TOOL_NAMES,
  VOICE_FIELD_IDS,
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
      'Open a project modal. Invocation: visitor asks to show or open a specific project, not just hear about it.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', enum: [...PROJECT_SLUGS] },
      },
      required: ['slug'],
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
    name: 'fill_field',
    description:
      'Type into a visible site field. Invocation: visitor dictates guestbook, feedback, palette, terminal, or chat text. Confirm before submit=true.',
    parameters: {
      type: 'object',
      properties: {
        field: { type: 'string', enum: [...VOICE_FIELD_IDS] },
        value: { type: 'string', description: 'Exact text to insert.' },
        submit: { type: 'boolean', description: 'Submit after typing. Default false.' },
      },
      required: ['field', 'value'],
    },
  },
  {
    name: 'set_preference',
    description:
      'Flip a settings toggle. Invocation: visitor asks to change sound, haptics, stickers, immersion, or voice extras.',
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
