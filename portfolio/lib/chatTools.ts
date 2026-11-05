// Site action tools offered to tool-capable chat models; calls become one validated ActionExecution.
import type OpenAI from 'openai';

import { hasActionExecution, type ActionExecution } from '@/lib/actions';
import { PROJECT_ACTIONS } from '@/lib/projectCatalog';
import { SITE_TOOL_DECLARATIONS } from '@/lib/siteToolDeclarations';
import { APPROVED_LINKS, type SiteToolName } from '@/lib/siteTools';
import { parseSiteToolCall } from '@/lib/siteToolValidation';

export interface RawToolCall {
  name: string;
  arguments: string;
}

const CHAT_TOOL_NAMES: ReadonlySet<SiteToolName> = new Set<SiteToolName>([
  'navigate_to',
  'set_theme',
  'open_project',
  'open_link',
  'open_feedback',
  'set_preference',
  'start_voice_session',
]);

export const PROJECT_INDEX = PROJECT_ACTIONS.map((project) => `${project.slug}: ${project.summary}`).join('\n');

export const CHAT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = SITE_TOOL_DECLARATIONS
  .filter((declaration) => CHAT_TOOL_NAMES.has(declaration.name))
  .map((declaration) => ({
    type: 'function',
    function: {
      name: declaration.name,
      // The shared description is written for voice, which navigates to /projects first; chat opens the card in place.
      description: declaration.name === 'open_project'
        ? `Open a project's details card when the visitor asks to show, open, or see a specific project. Projects (slug: what it is):\n${PROJECT_INDEX}`
        : declaration.description,
      parameters: { ...declaration.parameters },
    },
  }));

function toActionEffect(call: RawToolCall): ActionExecution | null {
  let args: unknown;
  try {
    args = call.arguments.trim() ? JSON.parse(call.arguments) : {};
  } catch {
    return null;
  }

  const parsed = parseSiteToolCall({ name: call.name, args });
  if (!parsed || !CHAT_TOOL_NAMES.has(parsed.name)) return null;

  switch (parsed.name) {
    case 'navigate_to':
      return { navigateTo: parsed.args.path };
    case 'set_theme':
      return { themeAction: parsed.args.action };
    case 'open_project':
      return { projectSlug: parsed.args.slug };
    case 'open_link':
      return { openUrls: [APPROVED_LINKS[parsed.args.key]] };
    case 'open_feedback':
      return { feedbackAction: true };
    case 'set_preference':
      return { preferenceAction: { key: parsed.args.key, enabled: parsed.args.enabled } };
    case 'start_voice_session':
      return { voiceSessionAction: true };
    default:
      return null;
  }
}

/** Merge model tool calls in order, skipping any call that is invalid or would break the action limits. */
export function toolCallsToAction(calls: readonly RawToolCall[]): ActionExecution | null {
  let action: ActionExecution = {};

  for (const call of calls) {
    const effect = toActionEffect(call);
    if (!effect) continue;
    const { openUrls, ...rest } = effect;
    if (Object.keys(rest).some((key) => action[key as keyof ActionExecution] !== undefined)) continue;

    const merged: ActionExecution = {
      ...action,
      ...rest,
      ...(openUrls ? { openUrls: [...new Set([...(action.openUrls ?? []), ...openUrls])] } : {}),
    };
    if (hasActionExecution(merged)) action = merged;
  }

  return Object.keys(action).length > 0 ? action : null;
}
