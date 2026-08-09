import 'server-only';

const LOCAL_MODEL_FALLBACK_NAME = 'Local model';
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 3_000;
const MAX_BASE_URL_LENGTH = 2_048;
const MAX_API_KEY_LENGTH = 1_024;
const MAX_MODEL_NAME_LENGTH = 128;

export interface LocalAgentStatus {
  healthy: boolean;
  modelName: string;
}

interface CachedStatus {
  expiresAt: number;
  value: LocalAgentStatus;
}

let cachedStatus: CachedStatus | null = null;
let pendingStatus: Promise<LocalAgentStatus> | null = null;

const unavailableStatus = (): LocalAgentStatus => ({
  healthy: false,
  modelName: LOCAL_MODEL_FALLBACK_NAME,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getAdvertisedModelName(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return null;

  for (const entry of payload.data) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue;
    const modelName = entry.id.trim();
    if (
      modelName.length > 0
      && modelName.length <= MAX_MODEL_NAME_LENGTH
      && /^[\x20-\x7E]+$/.test(modelName)
    ) {
      return modelName;
    }
  }

  return null;
}

export function deriveLocalAgentStatusUrls(baseUrlValue: string): { healthUrl: string; modelsUrl: string } {
  if (baseUrlValue.length === 0 || baseUrlValue.length > MAX_BASE_URL_LENGTH) {
    throw new TypeError('Invalid local agent base URL');
  }

  const baseUrl = new URL(baseUrlValue);
  if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
    throw new TypeError('Invalid local agent base URL');
  }

  const pathSegments = baseUrl.pathname.split('/').filter(Boolean);
  if (pathSegments.at(-1)?.toLowerCase() === 'v1') pathSegments.pop();

  baseUrl.pathname = pathSegments.length === 0 ? '/' : `/${pathSegments.join('/')}/`;
  baseUrl.search = '';
  baseUrl.hash = '';

  return {
    healthUrl: new URL('health', baseUrl).toString(),
    modelsUrl: new URL('v1/models', baseUrl).toString(),
  };
}

async function checkLocalAgentStatus(): Promise<LocalAgentStatus> {
  const baseUrlValue = process.env.LOCAL_AGENT_BASE_URL?.trim();
  const apiKey = process.env.LOCAL_AGENT_API_KEY?.trim();
  if (!baseUrlValue || !apiKey || apiKey.length > MAX_API_KEY_LENGTH) return unavailableStatus();

  let urls: ReturnType<typeof deriveLocalAgentStatusUrls>;
  try {
    urls = deriveLocalAgentStatusUrls(baseUrlValue);
  } catch {
    return unavailableStatus();
  }

  try {
    const healthResponse = await fetch(urls.healthUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!healthResponse.ok) return unavailableStatus();

    const modelsResponse = await fetch(urls.modelsUrl, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!modelsResponse.ok) return unavailableStatus();

    const modelName = getAdvertisedModelName(await modelsResponse.json());
    return modelName ? { healthy: true, modelName } : unavailableStatus();
  } catch {
    return unavailableStatus();
  }
}

export async function getLocalAgentStatus(): Promise<LocalAgentStatus> {
  if (cachedStatus && cachedStatus.expiresAt > Date.now()) return cachedStatus.value;
  if (pendingStatus) return pendingStatus;

  const statusRequest = checkLocalAgentStatus().then((value) => {
    cachedStatus = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  });
  pendingStatus = statusRequest;

  try {
    return await statusRequest;
  } finally {
    if (pendingStatus === statusRequest) pendingStatus = null;
  }
}

export function __resetLocalAgentStatusCacheForTest(): void {
  cachedStatus = null;
  pendingStatus = null;
}