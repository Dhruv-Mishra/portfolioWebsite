"use client";

const DB_NAME = 'dhruv-tts-audio-cache';
const DB_VERSION = 1;
const STORE_NAME = 'message-audio';
const CACHE_VERSION = 'v1';
const DEFAULT_VOICE = 'af_heart';
const DEFAULT_SPEED = 1;
const DEFAULT_CODEC = 'pcm_s16le';
const DEFAULT_SAMPLE_RATE = 24_000;

export interface CachedTtsAudio {
  byteLength: number;
  cacheKey: string;
  chunks: ArrayBuffer[];
  codec: string;
  createdAt: number;
  lastAccessedAt: number;
  messageId: string;
  sampleRate: number;
  speed: number;
  textHash: string;
  version: string;
  voice: string;
}

interface TtsAudioCacheOptions {
  codec?: string;
  sampleRate?: number;
  speed?: number;
  voice?: string;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createTtsAudioCacheKey(
  messageId: string,
  text: string,
  options: TtsAudioCacheOptions = {},
): string {
  const voice = options.voice ?? DEFAULT_VOICE;
  const speed = options.speed ?? DEFAULT_SPEED;
  const codec = options.codec ?? DEFAULT_CODEC;
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  return `tts:${CACHE_VERSION}:${messageId}:${hashString(text)}:${voice}:${speed}:${codec}:${sampleRate}`;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
        store.createIndex('messageId', 'messageId', { unique: false });
        store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
      }
    };

    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
  });

  return dbPromise;
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | null> {
  return openDb().then((db) => new Promise<T | null>((resolve) => {
    if (!db) {
      resolve(null);
      return;
    }

    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = operation(store);

    if (request) {
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    } else {
      transaction.oncomplete = () => resolve(null);
    }

    transaction.onerror = () => resolve(null);
  }));
}

export async function getCachedTtsAudio(cacheKey: string): Promise<CachedTtsAudio | null> {
  const record = await runTransaction<CachedTtsAudio>('readonly', store => store.get(cacheKey));
  if (!record || record.version !== CACHE_VERSION) return null;
  return record;
}

export async function putCachedTtsAudio(record: Omit<CachedTtsAudio, 'createdAt' | 'lastAccessedAt' | 'version'>): Promise<void> {
  const now = Date.now();
  await runTransaction('readwrite', (store) => {
    store.put({
      ...record,
      createdAt: now,
      lastAccessedAt: now,
      version: CACHE_VERSION,
    });
  });
}

export async function clearTtsAudioCache(): Promise<void> {
  await runTransaction('readwrite', (store) => {
    store.clear();
  });
}

export async function deleteTtsAudioForMessage(messageId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('messageId');
    const request = index.openCursor(IDBKeyRange.only(messageId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

export async function pruneTtsAudioCache(retainedMessageIds: readonly string[]): Promise<void> {
  const retained = new Set(retainedMessageIds);
  const db = await openDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value as CachedTtsAudio;
      if (!retained.has(record.messageId) || record.version !== CACHE_VERSION) {
        cursor.delete();
      }
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}
