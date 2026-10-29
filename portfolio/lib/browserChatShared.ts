import type { BrowserChatPromptMessage } from '@/lib/browserChatPrompt';
import { getChatModel } from '@/lib/chatModels';

export const BROWSER_CHAT_MODEL_REPO = getChatModel('on-device')?.upstreamModel ?? '';
// Pinned so a cached download stays valid and upstream changes need an explicit bump.
export const BROWSER_CHAT_MODEL_REVISION = '3c75909fbf17af6f734263e9cee75625bcfd7523';
export const BROWSER_CHAT_MODEL_DTYPE = 'q4f16';
export const BROWSER_CHAT_DOWNLOAD_SIZE_LABEL = 'about 900 MB';
export const BROWSER_CHAT_MAX_NEW_TOKENS = 256;
// Shared with the worker so the page can inspect the cache without loading transformers.js.
export const BROWSER_CHAT_CACHE_NAME = 'transformers-cache';
// Weights plus ONNX graph and tokenizer, with headroom for the browser's own bookkeeping.
export const BROWSER_CHAT_REQUIRED_BYTES = 1_100_000_000;
export const BROWSER_CHAT_REPO_URL_PREFIX = `https://huggingface.co/${BROWSER_CHAT_MODEL_REPO}/resolve/`;
export const BROWSER_CHAT_WEIGHTS_URL = `${BROWSER_CHAT_REPO_URL_PREFIX}${BROWSER_CHAT_MODEL_REVISION}/onnx/model_${BROWSER_CHAT_MODEL_DTYPE}.onnx_data`;

export type BrowserChatWorkerRequest =
  | { type: 'load'; id: number }
  | { type: 'generate'; id: number; messages: BrowserChatPromptMessage[] }
  | { type: 'abort'; id: number }
  | { type: 'clear-cache'; id: number };

export type BrowserChatWorkerResponse =
  | { type: 'progress'; progress: number }
  | { type: 'ready'; id: number }
  | { type: 'result'; id: number; text: string }
  | { type: 'cleared'; id: number }
  | { type: 'error'; id: number; message: string };
