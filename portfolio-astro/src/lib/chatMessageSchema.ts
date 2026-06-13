// lib/chatMessageSchema.ts — Shared message-shape validator for chat-style endpoints.
// Used by /api/chat and /api/chat/suggestions so both routes reject the same
// hostile payload shapes (missing role, system/tool injection, non-string content).

import type { ClientChatMessage } from '@/lib/chatTransport';

/**
 * Type guard for a single client-supplied chat message. Accepts only
 * `user` and `assistant` roles (system/tool roles are blocked here so a
 * caller cannot inject prompt-system context). `content` must be defined;
 * downstream callers `String(...)` it before any further use.
 */
export function isClientChatMessage(
  message: { role?: unknown; content?: unknown; signature?: unknown; action?: unknown },
): message is ClientChatMessage {
  return (message.role === 'user' || message.role === 'assistant')
    && typeof message.content !== 'undefined';
}
