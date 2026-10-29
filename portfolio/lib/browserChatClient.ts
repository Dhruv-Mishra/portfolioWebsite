"use client";

import { useSyncExternalStore } from 'react';
import {
  buildBrowserChatMessages,
  type BrowserChatFact,
  type BrowserChatTurn,
} from '@/lib/browserChatPrompt';
import {
  BROWSER_CHAT_CACHE_NAME,
  BROWSER_CHAT_MODEL_REVISION,
  BROWSER_CHAT_REQUIRED_BYTES,
  BROWSER_CHAT_WEIGHTS_URL,
  type BrowserChatWorkerRequest,
  type BrowserChatWorkerResponse,
} from '@/lib/browserChatShared';
import { CHAT_FACTS_ENDPOINT } from '@/lib/chatEndpoints';

const READY_STORAGE_KEY = 'browser-chat-model-ready';

export interface BrowserChatStatus {
  phase: 'idle' | 'loading' | 'ready' | 'error';
  progress: number | null;
  error: string | null;
  downloaded: boolean;
}

type GpuNavigator = Navigator & { gpu?: { requestAdapter(): Promise<{ features: ReadonlySet<string> } | null> } };
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Pending = { resolve: (message: BrowserChatWorkerResponse) => void; reject: (error: Error) => void };

const SERVER_STATUS: BrowserChatStatus = { phase: 'idle', progress: null, error: null, downloaded: false };

let status: BrowserChatStatus | null = null;
let worker: Worker | null = null;
let loadPromise: Promise<void> | null = null;
let factsPromise: Promise<readonly BrowserChatFact[]> | null = null;
let cacheChecked = false;
let nextId = 1;
const pending = new Map<number, Pending>();
const listeners = new Set<() => void>();

function readDownloaded(): boolean {
  try {
    return localStorage.getItem(READY_STORAGE_KEY) === BROWSER_CHAT_MODEL_REVISION;
  } catch {
    return false;
  }
}

function writeDownloaded(downloaded: boolean): void {
  try {
    if (downloaded) localStorage.setItem(READY_STORAGE_KEY, BROWSER_CHAT_MODEL_REVISION);
    else localStorage.removeItem(READY_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private modes.
  }
}

function getStatus(): BrowserChatStatus {
  status ??= { ...SERVER_STATUS, downloaded: readDownloaded() };
  return status;
}

function setStatus(next: Partial<BrowserChatStatus>): void {
  status = { ...getStatus(), ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!cacheChecked) {
    cacheChecked = true;
    void syncDownloadedWithCache();
  }
  return () => listeners.delete(listener);
}

async function hasCachedWeights(): Promise<boolean> {
  if (typeof caches === 'undefined' || !(await caches.has(BROWSER_CHAT_CACHE_NAME))) return false;
  const cache = await caches.open(BROWSER_CHAT_CACHE_NAME);
  return (await cache.match(BROWSER_CHAT_WEIGHTS_URL)) !== undefined;
}

// The ready flag can outlive evicted or cleared site storage; the Cache API is the source of truth,
// so a stale flag never triggers a silent 900 MB re-download without consent.
async function syncDownloadedWithCache(): Promise<void> {
  try {
    const cached = await hasCachedWeights();
    if (cached === getStatus().downloaded || getStatus().phase === 'loading') return;
    writeDownloaded(cached);
    setStatus({ downloaded: cached });
  } catch {
    // Cache inspection is best effort.
  }
}

async function assertStorageAvailable(): Promise<void> {
  if (getStatus().downloaded) return;
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  if (!estimate?.quota) return;
  if (estimate.quota - (estimate.usage ?? 0) < BROWSER_CHAT_REQUIRED_BYTES) {
    throw new Error('Not enough browser storage for the on-device model. Free up about 1 GB and retry.');
  }
}

export function useBrowserChatStatus(): BrowserChatStatus {
  return useSyncExternalStore(subscribe, getStatus, () => SERVER_STATUS);
}

export async function isBrowserChatSupported(): Promise<boolean> {
  try {
    const adapter = await (navigator as GpuNavigator).gpu?.requestAdapter();
    // The q4f16 weights need fp16 shader support.
    return Boolean(adapter?.features.has('shader-f16'));
  } catch {
    return false;
  }
}

function getWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL('./browserChatWorker.ts', import.meta.url), { type: 'module' });
  created.addEventListener('message', (event: MessageEvent<BrowserChatWorkerResponse>) => {
    const message = event.data;
    if (message.type === 'progress') {
      setStatus({ progress: message.progress });
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.type === 'error') request.reject(new Error(message.message));
    else request.resolve(message);
  });
  created.addEventListener('error', () => {
    for (const request of pending.values()) request.reject(new Error('On-device model worker crashed.'));
    pending.clear();
    created.terminate();
    worker = null;
    loadPromise = null;
    setStatus({ phase: 'error', progress: null, error: 'On-device model worker crashed.' });
  });
  worker = created;
  return created;
}

function request(message: DistributiveOmit<BrowserChatWorkerRequest, 'id'>): { id: number; done: Promise<BrowserChatWorkerResponse> } {
  const id = nextId++;
  const done = new Promise<BrowserChatWorkerResponse>((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
  getWorker().postMessage({ ...message, id });
  return { id, done };
}

export function loadBrowserChatModel(): Promise<void> {
  loadPromise ??= (async () => {
    setStatus({ phase: 'loading', progress: getStatus().downloaded ? null : 0, error: null });
    try {
      await assertStorageAvailable();
      await navigator.storage?.persist?.().catch(() => false);
      await request({ type: 'load' }).done;
      writeDownloaded(true);
      setStatus({ phase: 'ready', progress: null, downloaded: true });
    } catch (error) {
      loadPromise = null;
      const message = error instanceof Error ? error.message : 'Could not load the on-device model.';
      setStatus({ phase: 'error', progress: null, error: message });
      throw error;
    }
  })();
  return loadPromise;
}

function loadFacts(): Promise<readonly BrowserChatFact[]> {
  factsPromise ??= fetch(CHAT_FACTS_ENDPOINT)
    .then(async (response) => {
      const body: unknown = response.ok ? await response.json() : null;
      const facts = (body as { facts?: unknown } | null)?.facts;
      if (!Array.isArray(facts)) throw new Error('Facts unavailable');
      return facts as BrowserChatFact[];
    })
    .catch(() => {
      factsPromise = null;
      return [];
    });
  return factsPromise;
}

export async function generateBrowserChatReply(history: readonly BrowserChatTurn[], signal: AbortSignal): Promise<string> {
  const abortError = () => new DOMException('Aborted', 'AbortError');
  if (signal.aborted) throw abortError();

  const [facts] = await Promise.all([loadFacts(), loadBrowserChatModel()]);
  if (signal.aborted) throw abortError();

  const { id, done } = request({ type: 'generate', messages: buildBrowserChatMessages(facts, history) });
  const onAbort = () => getWorker().postMessage({ type: 'abort', id } satisfies BrowserChatWorkerRequest);
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    const message = await done;
    if (signal.aborted) throw abortError();
    return message.type === 'result' ? message.text : '';
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

export async function deleteBrowserChatModel(): Promise<void> {
  await request({ type: 'clear-cache' }).done;
  loadPromise = null;
  writeDownloaded(false);
  setStatus({ phase: 'idle', progress: null, error: null, downloaded: false });
}
