"use client";

const DB_NAME = 'dhruv-tts-audio-cache';
const DB_VERSION = 2;
const STORE_NAME = 'message-audio';
const CACHE_VERSION = 'v8';
const DEFAULT_CODEC = 'pcm_s16le';
const DEFAULT_SAMPLE_RATE = 24_000;
const DEFAULT_PROVIDER = 'pocket-tts';
const DEFAULT_VOICE = 'custom-dhruv';
const DEFAULT_SPEED = 1;
export const MAX_TTS_AUDIO_CACHE_BYTES = 32 * 1024 * 1024;
export const MAX_TTS_AUDIO_CACHE_RECORDS = 32;

export interface CachedTtsAudio {
  byteLength: number;
  cacheKey: string;
  chunks: ArrayBuffer[];
  codec: string;
  createdAt: number;
  lastAccessedAt: number;
  messageId: string;
  messageIds: string[];
  sampleRate: number;
  speed: number;
  spokenText: string;
  textHash: string;
  version: string;
  voice: string;
}

interface TtsAudioCacheOptions {
  codec?: string;
  provider?: string;
  sampleRate?: number;
  speed?: number;
  voice?: string;
  voiceRevision?: string;
}

type CachedTtsAudioWrite = Omit<CachedTtsAudio, 'createdAt' | 'lastAccessedAt' | 'messageIds' | 'version'> & {
  messageIds?: readonly string[];
};

interface TtsAudioCacheBudgetRecord {
  byteLength: number;
  cacheKey: string;
  lastAccessedAt: number;
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

function formatCacheNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

export function createTtsAudioTextHash(text: string): string {
  return hashString(text.trim());
}

export function createTtsAudioCacheKey(
  text: string,
  options: TtsAudioCacheOptions = {},
): string {
  const provider = options.provider ?? DEFAULT_PROVIDER;
  const voice = options.voice ?? DEFAULT_VOICE;
  const speed = options.speed ?? DEFAULT_SPEED;
  const codec = options.codec ?? DEFAULT_CODEC;
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const voiceRevision = options.voiceRevision ?? 'unknown';
  return `tts:${CACHE_VERSION}:${provider}:${createTtsAudioTextHash(text)}:${voice}:${voiceRevision}:${formatCacheNumber(speed)}:${codec}:${sampleRate}`;
}

function ensureIndex(
  store: IDBObjectStore,
  name: string,
  keyPath: string,
  options?: IDBIndexParameters,
): void {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, options);
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      const transaction = request.transaction;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? transaction?.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });

      if (!store) return;
      ensureIndex(store, 'messageId', 'messageId', { unique: false });
      ensureIndex(store, 'messageIds', 'messageIds', { multiEntry: true, unique: false });
      ensureIndex(store, 'lastAccessedAt', 'lastAccessedAt', { unique: false });
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
  return openDb().then((database) => new Promise<T | null>((resolve) => {
    if (!database) {
      resolve(null);
      return;
    }

    const transaction = database.transaction(STORE_NAME, mode);
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

function getAssociatedMessageIds(record: Pick<CachedTtsAudio, 'messageId'> & Partial<Pick<CachedTtsAudio, 'messageIds'>>): string[] {
  const ids = new Set<string>();
  if (Array.isArray(record.messageIds)) {
    for (const messageId of record.messageIds) {
      if (typeof messageId === 'string' && messageId) ids.add(messageId);
    }
  }
  if (record.messageId) ids.add(record.messageId);
  return [...ids];
}

function mergeMessageIds(
  existing: CachedTtsAudio | null,
  messageId: string,
  messageIds: readonly string[] = [],
): string[] {
  const ids = new Set(existing ? getAssociatedMessageIds(existing) : []);
  if (messageId) ids.add(messageId);
  for (const associatedMessageId of messageIds) {
    if (associatedMessageId) ids.add(associatedMessageId);
  }
  return [...ids];
}

function withAssociations(record: CachedTtsAudio, messageIds: readonly string[]): CachedTtsAudio {
  return {
    ...record,
    messageId: messageIds[0] ?? '',
    messageIds: [...messageIds],
  };
}

function continueCursorAfter<T>(request: IDBRequest<T>, cursor: IDBCursorWithValue): void {
  request.onsuccess = () => cursor.continue();
  request.onerror = () => cursor.continue();
}

export function getTtsAudioCacheEvictionKeys(
  records: readonly TtsAudioCacheBudgetRecord[],
  retainedCacheKey: string,
): string[] {
  const retained = records.find(record => record.cacheKey === retainedCacheKey);
  if (!retained || retained.byteLength > MAX_TTS_AUDIO_CACHE_BYTES) return [retainedCacheKey];

  let totalBytes = records.reduce((total, record) => total + Math.max(0, record.byteLength), 0);
  let totalRecords = records.length;
  const evictionKeys: string[] = [];
  const oldestFirst = [...records].sort((left, right) => (
    left.lastAccessedAt - right.lastAccessedAt || left.cacheKey.localeCompare(right.cacheKey)
  ));

  for (const record of oldestFirst) {
    if (totalBytes <= MAX_TTS_AUDIO_CACHE_BYTES && totalRecords <= MAX_TTS_AUDIO_CACHE_RECORDS) break;
    if (record.cacheKey === retainedCacheKey) continue;
    evictionKeys.push(record.cacheKey);
    totalBytes -= Math.max(0, record.byteLength);
    totalRecords -= 1;
  }

  return evictionKeys;
}

function pruneCacheBudgetAfterWrite(
  store: IDBObjectStore,
  retainedCacheKey: string,
): void {
  const records: TtsAudioCacheBudgetRecord[] = [];
  const cursorRequest = store.openCursor();

  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (cursor) {
      const record = cursor.value as CachedTtsAudio;
      records.push({
        byteLength: Number.isFinite(record.byteLength) ? record.byteLength : 0,
        cacheKey: record.cacheKey,
        lastAccessedAt: Number.isFinite(record.lastAccessedAt) ? record.lastAccessedAt : 0,
      });
      cursor.continue();
      return;
    }

    for (const cacheKey of getTtsAudioCacheEvictionKeys(records, retainedCacheKey)) {
      store.delete(cacheKey);
    }
  };
}

export async function getCachedTtsAudio(cacheKey: string, messageId: string, spokenText: string): Promise<CachedTtsAudio | null> {
  const database = await openDb();
  if (!database) return null;

  return await new Promise<CachedTtsAudio | null>((resolve) => {
    let cached: CachedTtsAudio | null = null;
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(cacheKey) as IDBRequest<CachedTtsAudio | undefined>;

    request.onsuccess = () => {
      const record = request.result;
      if (!record) return;
      if (record.version !== CACHE_VERSION) {
        store.delete(cacheKey);
        return;
      }
      if (record.spokenText !== spokenText) {
        return;
      }

      const messageIds = mergeMessageIds(record, messageId ?? '');
      const updated = withAssociations({
        ...record,
        lastAccessedAt: Date.now(),
      }, messageIds);
      cached = updated;
      store.put(updated);
    };

    transaction.oncomplete = () => resolve(cached);
    transaction.onerror = () => resolve(null);
    transaction.onabort = () => resolve(null);
  });
}

export async function putCachedTtsAudio(record: CachedTtsAudioWrite): Promise<void> {
  const database = await openDb();
  if (!database) return;

  const now = Date.now();
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(record.cacheKey) as IDBRequest<CachedTtsAudio | undefined>;

    request.onsuccess = () => {
      const existing = request.result?.version === CACHE_VERSION && request.result.spokenText === record.spokenText
        ? request.result
        : null;
      const messageIds = mergeMessageIds(existing, record.messageId, record.messageIds);
      const putRequest = store.put({
        ...record,
        createdAt: existing?.createdAt ?? now,
        lastAccessedAt: now,
        messageId: messageIds[0] ?? record.messageId,
        messageIds,
        version: CACHE_VERSION,
      });
      putRequest.onsuccess = () => pruneCacheBudgetAfterWrite(store, record.cacheKey);
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

export async function clearTtsAudioCache(): Promise<void> {
  await runTransaction('readwrite', (store) => {
    store.clear();
  });
}

export async function deleteTtsAudioForMessage(messageId: string): Promise<void> {
  const database = await openDb();
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value as CachedTtsAudio;
      if (record.version !== CACHE_VERSION) {
        continueCursorAfter(cursor.delete(), cursor);
        return;
      }

      const currentMessageIds = getAssociatedMessageIds(record);
      const nextMessageIds = currentMessageIds.filter(associatedMessageId => associatedMessageId !== messageId);
      if (nextMessageIds.length === currentMessageIds.length) {
        cursor.continue();
        return;
      }
      if (nextMessageIds.length === 0) {
        continueCursorAfter(cursor.delete(), cursor);
        return;
      }
      continueCursorAfter(cursor.update(withAssociations(record, nextMessageIds)), cursor);
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

export async function pruneTtsAudioCache(retainedMessageIds: readonly string[]): Promise<void> {
  const retained = new Set(retainedMessageIds);
  const database = await openDb();
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value as CachedTtsAudio;
      if (record.version !== CACHE_VERSION) {
        continueCursorAfter(cursor.delete(), cursor);
        return;
      }

      const currentMessageIds = getAssociatedMessageIds(record);
      const nextMessageIds = currentMessageIds.filter(messageId => retained.has(messageId));
      if (nextMessageIds.length === 0) {
        continueCursorAfter(cursor.delete(), cursor);
        return;
      }
      if (nextMessageIds.length === currentMessageIds.length) {
        cursor.continue();
        return;
      }
      continueCursorAfter(cursor.update(withAssociations(record, nextMessageIds)), cursor);
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}
