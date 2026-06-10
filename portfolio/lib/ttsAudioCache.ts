"use client";

const DB_NAME = 'dhruv-tts-audio-cache';
const DB_VERSION = 2;
const STORE_NAME = 'message-audio';
const CACHE_VERSION = 'v6';
const DEFAULT_CODEC = 'pcm_s16le';
const DEFAULT_SAMPLE_RATE = 24_000;

const ALLOWED_TTS_VOICES = [
  'expr-voice-2-m',
  'expr-voice-2-f',
  'expr-voice-3-m',
  'expr-voice-3-f',
  'expr-voice-4-m',
  'expr-voice-4-f',
  'expr-voice-5-m',
  'expr-voice-5-f',
] as const;
const DEFAULT_VOICE = getDefaultTtsVoice();
const DEFAULT_SPEED = getDefaultTtsSpeed();

function getDefaultTtsVoice(): string {
  const voice = process.env.NEXT_PUBLIC_TTS_VOICE;
  return voice && (ALLOWED_TTS_VOICES as readonly string[]).includes(voice) ? voice : 'expr-voice-5-m';
}

function getDefaultTtsSpeed(): number {
  const parsed = Number.parseFloat(process.env.NEXT_PUBLIC_TTS_SPEED ?? '1.08');
  if (!Number.isFinite(parsed)) return 1.08;
  return Math.min(1.15, Math.max(0.85, parsed));
}

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
  sampleRate?: number;
  speed?: number;
  voice?: string;
}

type CachedTtsAudioWrite = Omit<CachedTtsAudio, 'createdAt' | 'lastAccessedAt' | 'messageIds' | 'version'> & {
  messageIds?: readonly string[];
};

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
  const voice = options.voice ?? DEFAULT_VOICE;
  const speed = options.speed ?? DEFAULT_SPEED;
  const codec = options.codec ?? DEFAULT_CODEC;
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  return `tts:${CACHE_VERSION}:${createTtsAudioTextHash(text)}:${voice}:${formatCacheNumber(speed)}:${codec}:${sampleRate}`;
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
      store.put({
        ...record,
        createdAt: existing?.createdAt ?? now,
        lastAccessedAt: now,
        messageId: messageIds[0] ?? record.messageId,
        messageIds,
        version: CACHE_VERSION,
      });
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
