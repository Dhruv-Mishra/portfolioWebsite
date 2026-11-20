import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPendingNoteIssue, getApprovedNotes, resolveNotesRepo, resolveNotesToken } from '@/lib/notes.server';
import { parseIssueBody } from '@/lib/guestbook';
import { removeApprovedPendingGuestbookEntries } from '@/lib/guestbookPending';
import { GET } from '@/app/api/guestbook/route';
import { GITHUB_API_TIMEOUT_MS } from '@/lib/llmConfig';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  for (const prefix of ['GITHUB_GUESTBOOK', 'GITHUB_MATRIX_NOTES', 'GITHUB_FEEDBACK']) {
    vi.stubEnv(`${prefix}_REPO`, '');
    vi.stubEnv(`${prefix}_TOKEN`, '');
  }
  vi.stubEnv('GITHUB_FEEDBACK_REPO', ' owner/notes ');
  vi.stubEnv('GITHUB_FEEDBACK_TOKEN', ' fallback-token ');
  fetchMock.mockReset().mockResolvedValue(Response.json([]));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('note configuration', () => {
  it.each(['guestbook', 'matrix'] as const)('uses the feedback pair when %s overrides are blank', (kind) => {
    vi.stubEnv('GITHUB_GUESTBOOK_REPO', '  ');
    vi.stubEnv('GITHUB_GUESTBOOK_TOKEN', '  ');
    vi.stubEnv('GITHUB_MATRIX_NOTES_REPO', '  ');
    vi.stubEnv('GITHUB_MATRIX_NOTES_TOKEN', '  ');
    expect(resolveNotesRepo(kind)).toBe('owner/notes');
    expect(resolveNotesToken(kind)).toBe('fallback-token');
  });

  it('prefers trimmed kind-specific values over fallbacks', () => {
    vi.stubEnv('GITHUB_MATRIX_NOTES_REPO', ' owner/matrix ');
    vi.stubEnv('GITHUB_MATRIX_NOTES_TOKEN', ' matrix-token ');
    expect(resolveNotesRepo('matrix')).toBe('owner/matrix');
    expect(resolveNotesToken('matrix')).toBe('matrix-token');
  });
});

describe('note issue round trips', () => {
  it.each([
    ['guestbook', 'A_*[visitor]'], ['guestbook', ''],
    ['matrix', 'A_*[visitor]'], ['matrix', ''],
  ] as const)('round-trips %s notes signed %j and reconciles them', async (kind, name) => {
    const message = 'A lovely wall!\nKeep [making] things @home.';
    await createPendingNoteIssue({ kind, message, name, ip: '192.0.2.1' });
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { body: string };
    const parsed = parseIssueBody(payload.body);
    expect(parsed).toEqual({ message, name });
    expect(removeApprovedPendingGuestbookEntries([
      { id: 'pending', name, message, createdAt: new Date().toISOString() },
    ], [parsed])).toEqual([]);
  });

  it.each([
    '<details><summary>Metadata</summary>old metadata</details>',
    '---\nold metadata',
    '',
  ])('continues reading legacy bodies ending in %j', (suffix) => {
    expect(parseIssueBody(`## Message\n\nHello wall\n\n## Name\n\nVisitor\n\n${suffix}`))
      .toEqual({ message: 'Hello wall', name: 'Visitor' });
  });

  it('does not mistake an escaped signer name for the generated footer', async () => {
    const name = '_Submitted via portfolio website guestbook_';
    await createPendingNoteIssue({ kind: 'guestbook', message: 'Hello wall', name, ip: '' });
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { body: string };
    expect(parseIssueBody(payload.body).name).toBe(name);
  });
});

describe('approved notes loading', () => {
  it.each(['guestbook', 'matrix'] as const)('loads up to 100 approved %s notes', async (kind) => {
    fetchMock.mockResolvedValue(Response.json([
      { number: 7, body: '## Message\nHello wall\n## Name\nAnonymous', created_at: '2026-11-20T00:00:00Z' },
    ]));
    expect(await getApprovedNotes(kind)).toEqual([
      { id: 7, message: 'Hello wall', name: '', createdAt: '2026-11-20T00:00:00Z' },
    ]);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('per_page')).toBe('100');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer fallback-token' });
  });

  it('distinguishes an empty success from a failed upstream', async () => {
    expect(await getApprovedNotes('guestbook')).toEqual([]);
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(getApprovedNotes('guestbook')).rejects.toThrow();
  });

  it('does not represent missing configuration as an empty wall', async () => {
    vi.stubEnv('GITHUB_FEEDBACK_TOKEN', '');
    await expect(getApprovedNotes('guestbook')).rejects.toThrow('not configured');
    expect((await GET()).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the public GET empty-success response and larger page size', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entries: [] });
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('per_page')).toBe('100');
  });

  it.each([401, 403, 500])('returns a recoverable public GET failure for GitHub %s', async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toHaveProperty('error');
  });

  it('aborts timed-out loads rather than reporting an empty success', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const load = getApprovedNotes('guestbook');
    const assertion = expect(load).rejects.toThrow('Aborted');
    await vi.advanceTimersByTimeAsync(GITHUB_API_TIMEOUT_MS);
    await assertion;
    const response = GET();
    await vi.advanceTimersByTimeAsync(GITHUB_API_TIMEOUT_MS);
    expect((await response).status).toBe(503);
    expect(vi.getTimerCount()).toBe(0);
  });
});
