import type { ActionExecution } from '@/lib/actions';
import type { ChatModelId } from '@/lib/chatModels';

export interface ChatImage {
  dataUrl: string;
}

export interface ChatRequest {
  messages: ClientChatMessage[];
  model?: ChatModelId;
  image?: ChatImage;
}

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