import type { ActionExecution } from '@/lib/actions';
import type { ChatModelId } from '@/lib/chatModels';

export interface ChatImage {
  dataUrl: string;
}

export const CHAT_STREAM_CONTENT_TYPE = 'application/x-ndjson';

export interface ChatReplyPayload {
  reply: string;
  action: ActionExecution | null;
  signature: string;
  modelId?: ChatModelId | 'legacy';
  degraded?: boolean;
  fallbackReason?: string;
}

/** Deltas carry provisional display text; `done` carries the signed, finalized reply. */
export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | ({ type: 'done' } & ChatReplyPayload);

export interface ClientChatMessage {
  role: 'user' | 'assistant';
  content: string;
  signature?: string;
  action?: ActionExecution | null;
}

export interface SanitizedChatMessage {
  role: 'user' | 'assistant';
  content: string;
  action?: ActionExecution | null;
}