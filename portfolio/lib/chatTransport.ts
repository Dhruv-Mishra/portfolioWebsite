import type { ActionExecution } from '@/lib/actions';

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