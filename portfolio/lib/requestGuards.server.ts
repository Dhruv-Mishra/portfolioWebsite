import 'server-only';

interface SizedJsonSuccess<T> {
  ok: true;
  body: T;
}

interface SizedJsonFailure {
  ok: false;
  response: Response;
}

export type SizedJsonResult<T> = SizedJsonSuccess<T> | SizedJsonFailure;

function parseContentLength(request: Request): number | null {
  const header = request.headers.get('content-length');
  if (!header) return null;

  const parsed = Number(header);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function readSizedJsonBody<T>(
  request: Request,
  maxBytes: number,
): Promise<SizedJsonResult<T>> {
  const contentLength = parseContentLength(request);
  if (contentLength === null) {
    return {
      ok: false,
      response: Response.json({ error: 'Content-Length header required' }, { status: 411 }),
    };
  }

  if (contentLength > maxBytes) {
    return {
      ok: false,
      response: Response.json({ error: 'Request body is too large' }, { status: 413 }),
    };
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return {
      ok: false,
      response: Response.json({ error: 'Invalid request body' }, { status: 400 }),
    };
  }

  if (Buffer.byteLength(rawBody, 'utf8') > maxBytes) {
    return {
      ok: false,
      response: Response.json({ error: 'Request body is too large' }, { status: 413 }),
    };
  }

  try {
    return { ok: true, body: JSON.parse(rawBody) as T };
  } catch {
    return {
      ok: false,
      response: Response.json({ error: 'Invalid JSON body' }, { status: 400 }),
    };
  }
}