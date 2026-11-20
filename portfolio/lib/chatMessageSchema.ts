// lib/chatMessageSchema.ts — Shared message-shape validator for chat-style endpoints.
import type { ClientChatMessage } from '@/lib/chatTransport';

export function isClientChatMessage(message: unknown): message is ClientChatMessage {
  return typeof message === 'object' && message !== null && !Array.isArray(message)
    && 'role' in message && (message.role === 'user' || message.role === 'assistant')
    && 'content' in message && typeof message.content === 'string';
}
