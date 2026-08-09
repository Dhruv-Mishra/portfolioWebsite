import 'server-only';

import { isChatModelId, type ChatModelId } from '@/lib/chatModels';

export const MODEL_HEALTH_CACHE_TTL_MS = 5 * 60 * 1000;
export const MODEL_HEALTH_REQUEST_TIMEOUT_MS = 3_000;

const GITHUB_CONTENTS_API_BASE_URL = 'https://api.github.com/repos';
const MAX_SNAPSHOT_BYTES = 64 * 1024;
const MAX_FAILURE_CODE_LENGTH = 64;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const FAILURE_CODE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const SOURCE_SITE_PATTERN = /^[a-z0-9.-]{1,253}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MODEL_HEALTH_STATES = new Set(['healthy', 'degraded', 'unhealthy', 'unknown']);

export type ModelHealthEnvironment = 'staging' | 'production';
export type AdvisoryModelHealthState = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface ModelHealthAdvisory {
  expiresAt: string;
  models: Array<{
    id: ChatModelId;
    state: AdvisoryModelHealthState;
  }>;
}

interface ModelHealthReaderConfig {
  environment: ModelHealthEnvironment;
  repository: string;
  token: string;
}

interface CachedAdvisory {
  key: string;
  expiresAt: number;
  value: ModelHealthAdvisory | null;
}

interface PendingAdvisory {
  key: string;
  request: Promise<ModelHealthAdvisory | null>;
}

type UnknownRecord = Record<string, unknown>;

let cachedAdvisory: CachedAdvisory | null = null;
let pendingAdvisory: PendingAdvisory | null = null;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: UnknownRecord, requiredKeys: readonly string[], optionalKeys: readonly string[] = []): boolean {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  return requiredKeys.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowedKeys.has(key));
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !TIMESTAMP_PATTERN.test(value)) return false;

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;

  const canonical = new Date(timestamp).toISOString();
  return canonical === value || canonical === value.replace('Z', '.000Z');
}

function parseEnvironment(value: string | undefined): ModelHealthEnvironment | null {
  const environment = value?.trim();
  return environment === 'staging' || environment === 'production' ? environment : null;
}

function getReaderConfig(): ModelHealthReaderConfig | null {
  const repository = process.env.GITHUB_MODEL_HEALTH_REPO?.trim();
  const token = process.env.GITHUB_MODEL_HEALTH_TOKEN?.trim();
  const environment = parseEnvironment(process.env.MODEL_HEALTH_ENVIRONMENT);

  if (!repository || !REPOSITORY_PATTERN.test(repository) || !token || !environment) return null;

  return { environment, repository, token };
}

function parseModelEntry(value: unknown): { id: ChatModelId; state: AdvisoryModelHealthState } | null {
  if (!isRecord(value) || !hasExactKeys(
    value,
    ['id', 'state', 'checkedAt', 'consecutiveFailures', 'failureCode'],
    ['latencyMs'],
  )) {
    return null;
  }

  if (!isChatModelId(value.id) || typeof value.state !== 'string' || !MODEL_HEALTH_STATES.has(value.state)) {
    return null;
  }
  if (!isCanonicalTimestamp(value.checkedAt)) return null;
  const consecutiveFailures = value.consecutiveFailures;
  if (
    typeof consecutiveFailures !== 'number'
    || !Number.isSafeInteger(consecutiveFailures)
    || consecutiveFailures < 0
  ) {
    return null;
  }
  if (value.failureCode !== null && (
    typeof value.failureCode !== 'string'
    || value.failureCode.length === 0
    || value.failureCode.length > MAX_FAILURE_CODE_LENGTH
    || !FAILURE_CODE_PATTERN.test(value.failureCode)
  )) {
    return null;
  }
  const latencyMs = value.latencyMs;
  if (Object.hasOwn(value, 'latencyMs') && (
    typeof latencyMs !== 'number' || !Number.isSafeInteger(latencyMs) || latencyMs < 0
  )) {
    return null;
  }

  return { id: value.id, state: value.state as AdvisoryModelHealthState };
}

function isValidSource(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, ['workflow', 'runId', 'site'])) return false;

  return value.workflow === 'publish-model-health'
    && typeof value.runId === 'string'
    && /^\d+$/.test(value.runId)
    && typeof value.site === 'string'
    && SOURCE_SITE_PATTERN.test(value.site);
}

export function parseModelHealthSnapshot(
  value: unknown,
  environment: ModelHealthEnvironment,
  now = Date.now(),
): ModelHealthAdvisory | null {
  if (!isRecord(value) || !hasExactKeys(
    value,
    ['schemaVersion', 'environment', 'generatedAt', 'expiresAt', 'probeMode', 'source', 'models'],
  )) {
    return null;
  }
  if (
    value.schemaVersion !== 1
    || value.environment !== environment
    || value.probeMode !== 'canary'
    || !isCanonicalTimestamp(value.generatedAt)
    || !isCanonicalTimestamp(value.expiresAt)
    || !isValidSource(value.source)
    || !Array.isArray(value.models)
    || value.models.length === 0
  ) {
    return null;
  }

  const generatedAt = Date.parse(value.generatedAt);
  const expiresAt = Date.parse(value.expiresAt);
  if (expiresAt <= generatedAt || expiresAt <= now) return null;

  const models = value.models.map(parseModelEntry);
  if (models.some((model) => model === null)) return null;

  const parsedModels = models as Array<{ id: ChatModelId; state: AdvisoryModelHealthState }>;
  if (new Set(parsedModels.map((model) => model.id)).size !== parsedModels.length) return null;

  return {
    expiresAt: value.expiresAt,
    models: parsedModels,
  };
}

function decodeSnapshotContent(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const normalized = value.replace(/\r?\n/g, '');
  if (
    normalized.length === 0
    || normalized.length > Math.ceil(MAX_SNAPSHOT_BYTES * 4 / 3) + 4
    || !BASE64_PATTERN.test(normalized)
  ) {
    return null;
  }

  const decoded = Buffer.from(normalized, 'base64');
  if (decoded.byteLength === 0 || decoded.byteLength > MAX_SNAPSHOT_BYTES) return null;

  const text = decoded.toString('utf8');
  return Buffer.from(text, 'utf8').equals(decoded) ? text : null;
}

function getConfigCacheKey(config: ModelHealthReaderConfig): string {
  return `${config.repository}\u0000${config.environment}\u0000${config.token}`;
}

async function readModelHealthAdvisory(config: ModelHealthReaderConfig): Promise<ModelHealthAdvisory | null> {
  const snapshotUrl = `${GITHUB_CONTENTS_API_BASE_URL}/${config.repository}/contents/status/v1/${config.environment}.json`;

  try {
    const response = await fetch(snapshotUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${config.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(MODEL_HEALTH_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const payload = await response.json();
    if (!isRecord(payload) || payload.encoding !== 'base64') return null;

    const encodedSnapshot = decodeSnapshotContent(payload.content);
    if (!encodedSnapshot) return null;

    return parseModelHealthSnapshot(JSON.parse(encodedSnapshot), config.environment);
  } catch {
    return null;
  }
}

export async function getModelHealthAdvisory(): Promise<ModelHealthAdvisory | null> {
  const config = getReaderConfig();
  if (!config) return null;

  const cacheKey = getConfigCacheKey(config);
  if (cachedAdvisory?.key === cacheKey && cachedAdvisory.expiresAt > Date.now()) {
    return cachedAdvisory.value;
  }
  if (pendingAdvisory?.key === cacheKey) return pendingAdvisory.request;

  const request = readModelHealthAdvisory(config).then((value) => {
    cachedAdvisory = {
      key: cacheKey,
      value,
      expiresAt: Date.now() + MODEL_HEALTH_CACHE_TTL_MS,
    };
    return value;
  });
  pendingAdvisory = { key: cacheKey, request };

  try {
    return await request;
  } finally {
    if (pendingAdvisory?.request === request) pendingAdvisory = null;
  }
}

export function __resetModelHealthCacheForTest(): void {
  cachedAdvisory = null;
  pendingAdvisory = null;
}