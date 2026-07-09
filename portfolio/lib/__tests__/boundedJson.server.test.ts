import { describe, expect, it } from 'vitest';

import { BoundedJsonError, readBoundedJson } from '@/lib/boundedJson.server';

function expectBoundedError(code: BoundedJsonError['code'], status: BoundedJsonError['status']) {
  return expect.objectContaining({ code, status });
}

describe('readBoundedJson', () => {
  it.each([
    [undefined, 'missing-content-length', 411],
    ['invalid', 'invalid-content-length', 400],
    ['-1', 'invalid-content-length', 400],
    ['9007199254740992', 'invalid-content-length', 400],
    ['9', 'payload-too-large', 413],
  ] as const)('rejects content-length %s', async (contentLength, code, status) => {
    const headers = contentLength === undefined ? undefined : { 'content-length': contentLength };
    const request = new Request('http://localhost/test', {
      method: 'POST',
      headers,
      body: '{}',
    });

    await expect(readBoundedJson(request, 8)).rejects.toEqual(expectBoundedError(code, status));
  });

  it('rejects an oversized stream before parsing when the declared length is false', async () => {
    const request = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'content-length': '2' },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"hidden":"oversized"}'));
          controller.close();
        },
      }),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    await expect(readBoundedJson(request, 8)).rejects.toEqual(
      expectBoundedError('payload-too-large', 413),
    );
  });

  it('parses a valid bounded JSON body', async () => {
    const body = JSON.stringify({ ok: true });
    const request = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'content-length': String(new TextEncoder().encode(body).byteLength) },
      body,
    });

    await expect(readBoundedJson<{ ok: boolean }>(request, 32)).resolves.toEqual({ ok: true });
  });

  it('rejects malformed JSON after reading the bounded body', async () => {
    const request = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'content-length': '1' },
      body: '{',
    });

    await expect(readBoundedJson(request, 8)).rejects.toEqual(expectBoundedError('invalid-json', 400));
  });

  it('cancels a stalled body read when the propagated signal aborts', async () => {
    const controller = new AbortController();
    const request = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'content-length': '2' },
      body: new ReadableStream<Uint8Array>(),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const result = readBoundedJson(request, 8, controller.signal);
    controller.abort('deadline');

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });
});