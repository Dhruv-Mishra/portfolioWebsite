import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { hasActionExecution, type ActionExecution } from '@/lib/actions';
import type { ClientChatMessage, SanitizedChatMessage } from '@/lib/chatTransport';

const SIGNATURE_VERSION = 1;
const MAX_RECENT_MESSAGES = 8;
const MAX_RECENT_CONTENT_CHARS = 3_200;

function getSigningSecret(): string {
  const signingSecret = process.env.CHAT_HISTORY_SIGNING_SECRET?.trim();
  if (signingSecret) return signingSecret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('CHAT_HISTORY_SIGNING_SECRET is required in production.');
  }

  return 'development-chat-history-secret';
}

function normalizeAction(action: ActionExecution | null | undefined): ActionExecution | null {
  if (action === null || action === undefined) {
    return null;
  }

  if (!hasActionExecution(action)) {
    const isLegacyEmptyAction = typeof action === 'object'
      && !Array.isArray(action)
      && Object.values(action).every(value => value === undefined);
    if (isLegacyEmptyAction) return null;
    throw new TypeError('Invalid chat action');
  }

  const normalized: ActionExecution = {};

  if (action.navigateTo) {
    normalized.navigateTo = action.navigateTo;
  }

  if (action.themeAction) {
    normalized.themeAction = action.themeAction;
  }

  if (action.feedbackAction) {
    normalized.feedbackAction = true;
  }

  if (action.projectSlug) {
    normalized.projectSlug = action.projectSlug;
  }

  if (action.commandPaletteAction) {
    normalized.commandPaletteAction = true;
  }

  if (action.openUrls?.length) {
    normalized.openUrls = [...new Set(action.openUrls)];
  }

  return normalized;
}

function serializeAssistantPayload(content: string, action: ActionExecution | null): string {
  return JSON.stringify({
    version: SIGNATURE_VERSION,
    role: 'assistant',
    content,
    action,
  });
}

export function signAssistantMessage(content: string, action: ActionExecution | null | undefined): string {
  const payload = serializeAssistantPayload(content, normalizeAction(action));

  return createHmac('sha256', getSigningSecret())
    .update(payload)
    .digest('hex');
}

export function verifyAssistantMessage(message: ClientChatMessage): SanitizedChatMessage | null {
  if (message.role !== 'assistant' || typeof message.signature !== 'string' || !message.signature) {
    return null;
  }

  let normalizedAction: ActionExecution | null;
  try {
    normalizedAction = normalizeAction(message.action);
  } catch {
    return null;
  }
  const expected = signAssistantMessage(message.content, normalizedAction);
  const provided = Buffer.from(message.signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (provided.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(provided, expectedBuffer)) {
    return null;
  }

  return {
    role: 'assistant',
    content: message.content,
    ...(normalizedAction ? { action: normalizedAction } : {}),
  };
}

/**
 * Keep the newest verified conversation entries within the provider context
 * budget. The latest message is always retained because each entry has
 * already passed the route's per-message content cap.
 */
export function selectRecentChatHistory(messages: readonly SanitizedChatMessage[]): SanitizedChatMessage[] {
  const selectedNewestFirst: SanitizedChatMessage[] = [];
  let contentChars = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const isLatest = selectedNewestFirst.length === 0;
    const withinMessageBudget = selectedNewestFirst.length < MAX_RECENT_MESSAGES;
    const withinContentBudget = contentChars + message.content.length <= MAX_RECENT_CONTENT_CHARS;

    if (!isLatest && (!withinMessageBudget || !withinContentBudget)) {
      break;
    }

    selectedNewestFirst.push(message);
    contentChars += message.content.length;
  }

  return selectedNewestFirst.reverse();
}