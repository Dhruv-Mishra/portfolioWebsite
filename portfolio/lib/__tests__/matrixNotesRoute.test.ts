import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createPendingNoteIssueMock, getApprovedNotesMock } = vi.hoisted(() => ({
  createPendingNoteIssueMock: vi.fn(async () => undefined),
  getApprovedNotesMock: vi.fn(async () => []),
}));

vi.mock('@/lib/notes.server', () => ({
  createPendingNoteIssue: createPendingNoteIssueMock,
  getApprovedNotes: getApprovedNotesMock,
  resolveNotesRepo: vi.fn(() => 'owner/repo'),
  resolveNotesToken: vi.fn(() => 'test-token'),
}));

import { GET, POST } from '@/app/api/matrix-notes/route';
import {
  issueMatrixNotesAccessToken,
  MATRIX_NOTES_ACCESS_COOKIE,
} from '@/lib/matrixNotesAccess.server';
import { GUESTBOOK_LIMITS } from '@/lib/designTokens';

beforeAll(() => {
  process.env.MATRIX_NOTES_ACCESS_SECRET = 'matrix-route-test-secret';
});

beforeEach(() => {
  vi.clearAllMocks();
});

function createRequest(
  method: 'GET' | 'POST',
  options: { cookie?: string; query?: string; body?: Record<string, unknown> } = {},
): NextRequest {
  const body = options.body ? JSON.stringify(options.body) : undefined;
  const headers = new Headers();
  if (options.cookie) {
    headers.set('cookie', `${MATRIX_NOTES_ACCESS_COOKIE}=${options.cookie}`);
  }
  if (body) {
    headers.set('content-type', 'application/json');
    headers.set('content-length', String(Buffer.byteLength(body)));
    headers.set('origin', 'https://whoisdhruv.com');
  }

  return new NextRequest(`https://whoisdhruv.com/api/matrix-notes${options.query ?? ''}`, {
    method,
    headers,
    body,
  });
}

describe('matrix notes API access control', () => {
  it('denies direct GET and POST requests without signed access', async () => {
    const getResponse = await GET(createRequest('GET'));
    const postResponse = await POST(createRequest('POST', {
      body: { message: 'hello from outside' },
    }));

    expect(getResponse.status).toBe(404);
    expect(postResponse.status).toBe(404);
    expect(createPendingNoteIssueMock).not.toHaveBeenCalled();
  });

  it('does not treat the escape query parameter as authority', async () => {
    expect((await GET(createRequest('GET', { query: '?from=escape' }))).status).toBe(404);
  });

  it('allows listing with a valid signed cookie', async () => {
    const response = await GET(createRequest('GET', {
      cookie: issueMatrixNotesAccessToken(),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty('entries');
  });

  it('allows submission with a valid signed cookie', async () => {
    const response = await POST(createRequest('POST', {
      cookie: issueMatrixNotesAccessToken(),
      body: { message: 'A valid transmission', name: 'Neo' },
    }));

    expect(response.status).toBe(200);
    expect(createPendingNoteIssueMock).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'matrix',
      message: 'A valid transmission',
      name: 'Neo',
    }));
  });

  it('rejects raw overlength content instead of silently slicing it', async () => {
    const response = await POST(createRequest('POST', {
      cookie: issueMatrixNotesAccessToken(),
      body: { message: 'x'.repeat(GUESTBOOK_LIMITS.maxMessageLength + 1) },
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Message too long.' });
    expect(createPendingNoteIssueMock).not.toHaveBeenCalled();
  });
});