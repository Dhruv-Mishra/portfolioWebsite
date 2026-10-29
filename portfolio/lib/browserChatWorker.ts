/// <reference lib="webworker" />

import type { InterruptableStoppingCriteria, ProgressInfo, TextGenerationPipeline } from '@huggingface/transformers';
import {
  BROWSER_CHAT_MAX_NEW_TOKENS,
  BROWSER_CHAT_MODEL_DTYPE,
  BROWSER_CHAT_MODEL_REPO,
  BROWSER_CHAT_MODEL_REVISION,
  type BrowserChatWorkerRequest,
  type BrowserChatWorkerResponse,
} from './browserChatShared';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const MODEL_OPTIONS = {
  device: 'webgpu',
  dtype: BROWSER_CHAT_MODEL_DTYPE,
  revision: BROWSER_CHAT_MODEL_REVISION,
} as const;

let generatorPromise: Promise<TextGenerationPipeline> | null = null;
const stoppers = new Map<number, InterruptableStoppingCriteria>();

function post(message: BrowserChatWorkerResponse): void {
  ctx.postMessage(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadGenerator(): Promise<TextGenerationPipeline> {
  generatorPromise ??= (async () => {
    const { pipeline } = await import('@huggingface/transformers');
    return pipeline('text-generation', BROWSER_CHAT_MODEL_REPO, {
      ...MODEL_OPTIONS,
      progress_callback: (info: ProgressInfo) => {
        if (info.status === 'progress_total') post({ type: 'progress', progress: info.progress / 100 });
      },
    });
  })().catch((error: unknown) => {
    generatorPromise = null;
    throw error;
  });
  return generatorPromise;
}

function readReply(output: unknown): string {
  const first: unknown = Array.isArray(output) ? output[0] : output;
  const generated = (first as { generated_text?: unknown } | undefined)?.generated_text;
  if (typeof generated === 'string') return generated;
  if (!Array.isArray(generated)) return '';
  const last: unknown = generated.at(-1);
  const content = (last as { content?: unknown } | undefined)?.content;
  return typeof content === 'string' ? content : '';
}

async function generate(id: number, messages: Extract<BrowserChatWorkerRequest, { type: 'generate' }>['messages']) {
  const generator = await loadGenerator();
  const { InterruptableStoppingCriteria } = await import('@huggingface/transformers');
  const stopper = new InterruptableStoppingCriteria();
  stoppers.set(id, stopper);
  try {
    const output = await generator(messages, {
      max_new_tokens: BROWSER_CHAT_MAX_NEW_TOKENS,
      do_sample: true,
      temperature: 0.1,
      top_k: 50,
      repetition_penalty: 1.1,
      tokenizer_encode_kwargs: { enable_thinking: false },
      stopping_criteria: stopper,
    } as Parameters<TextGenerationPipeline['_call']>[1]);
    post({ type: 'result', id, text: readReply(output).trim() });
  } finally {
    stoppers.delete(id);
  }
}

async function clearCache(id: number) {
  const loaded = generatorPromise;
  generatorPromise = null;
  if (loaded) await loaded.then((generator) => generator.dispose()).catch(() => undefined);
  const { env } = await import('@huggingface/transformers');
  const cache = await caches.open(env.cacheKey);
  const requests = await cache.keys();
  await Promise.all(requests
    .filter((cached) => cached.url.includes(`/${BROWSER_CHAT_MODEL_REPO}/`))
    .map((cached) => cache.delete(cached)));
  post({ type: 'cleared', id });
}

ctx.addEventListener('message', (event: MessageEvent<BrowserChatWorkerRequest>) => {
  const message = event.data;
  const fail = (error: unknown) => post({ type: 'error', id: message.id, message: errorMessage(error) });

  switch (message.type) {
    case 'load':
      loadGenerator().then(() => post({ type: 'ready', id: message.id }), fail);
      break;
    case 'generate':
      generate(message.id, message.messages).catch(fail);
      break;
    case 'abort':
      stoppers.get(message.id)?.interrupt();
      break;
    case 'clear-cache':
      clearCache(message.id).catch(fail);
      break;
  }
});
