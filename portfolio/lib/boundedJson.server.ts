import 'server-only';

export type BoundedJsonErrorCode =
  | 'missing-content-length'
  | 'invalid-content-length'
  | 'payload-too-large'
  | 'invalid-json';

const ERROR_MESSAGES: Record<BoundedJsonErrorCode, string> = {
  'missing-content-length': 'Content-Length header required',
  'invalid-content-length': 'Invalid Content-Length header',
  'payload-too-large': 'Request body is too large',
  'invalid-json': 'Invalid JSON body',
};

export class BoundedJsonError extends Error {
  constructor(
    public readonly code: BoundedJsonErrorCode,
    public readonly status: 400 | 411 | 413,
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = 'BoundedJsonError';
  }

  toResponse(): Response {
    return Response.json({ error: this.message }, { status: this.status });
  }
}

/**
 * Read a size-bounded JSON object body. Returns the client-error Response to send when the
 * body is missing, oversized, malformed, or not a plain object; other errors (aborts) rethrow.
 */
export async function readJsonObjectOrError<T extends object>(
  request: Request,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<T | Response> {
  let body: unknown;
  try {
    body = await readBoundedJson<unknown>(request, maxBytes, signal);
  } catch (error) {
    if (error instanceof BoundedJsonError) return error.toResponse();
    throw error;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return new BoundedJsonError('invalid-json', 400).toResponse();
  }
  return body as T;
}

function parseContentLength(request: Request, maxBytes: number): number {
  const header = request.headers.get('content-length');
  if (header === null) {
    throw new BoundedJsonError('missing-content-length', 411);
  }

  if (!/^\d+$/.test(header)) {
    throw new BoundedJsonError('invalid-content-length', 400);
  }

  const contentLength = Number(header);
  if (!Number.isSafeInteger(contentLength)) {
    throw new BoundedJsonError('invalid-content-length', 400);
  }

  if (contentLength > maxBytes) {
    throw new BoundedJsonError('payload-too-large', 413);
  }

  return contentLength;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Request body read aborted', 'AbortError');
  }
}

export async function readBoundedJson<T>(
  request: Request,
  maxBytes: number,
  signal: AbortSignal = request.signal,
): Promise<T> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('maxBytes must be a non-negative safe integer');
  }

  parseContentLength(request, maxBytes);
  throwIfAborted(signal);

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  if (reader) {
    const handleAbort = () => {
      void reader.cancel('request-aborted');
    };
    signal.addEventListener('abort', handleAbort, { once: true });

    try {
      while (true) {
        const { done, value } = await reader.read();
        throwIfAborted(signal);
        if (done) break;

        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          void reader.cancel('payload-too-large');
          throw new BoundedJsonError('payload-too-large', 413);
        }

        chunks.push(value);
      }
    } finally {
      signal.removeEventListener('abort', handleAbort);
      reader.releaseLock();
    }
  }

  const payload = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(payload);
    return JSON.parse(text) as T;
  } catch {
    throw new BoundedJsonError('invalid-json', 400);
  }
}