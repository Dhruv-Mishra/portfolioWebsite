import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { hasActionExecution, type ActionExecution } from '@/lib/actions';
import type { ClientChatMessage, SanitizedChatMessage } from '@/lib/chatTransport';

const SIGNATURE_VERSION = 1;

function getSigningSecret(): string {
  return process.env.CHAT_HISTORY_SIGNING_SECRET
    || process.env.LLM_API_KEY
    || process.env.LLM_FALLBACK_API_KEY
    || 'development-chat-history-secret';
}

function normalizeAction(action: ActionExecution | null | undefined): ActionExecution | null {
  if (!hasActionExecution(action)) {
    return null;
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

  const normalizedAction = normalizeAction(message.action);
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