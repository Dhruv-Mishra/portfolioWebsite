import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let lastFetchInit: RequestInit | undefined;
const fetchMock = vi.fn(
  async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    lastFetchInit = init;
    return Response.json({ number: 42 });
  },
);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  lastFetchInit = undefined;
  process.env.GITHUB_FEEDBACK_TOKEN = 'feedback-test-token';
  process.env.GITHUB_FEEDBACK_REPO = 'owner/feedback';
  process.env.GITHUB_GUESTBOOK_TOKEN = 'notes-test-token';
  process.env.GITHUB_GUESTBOOK_REPO = 'owner/notes';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GITHUB_FEEDBACK_TOKEN;
  delete process.env.GITHUB_FEEDBACK_REPO;
  delete process.env.GITHUB_GUESTBOOK_TOKEN;
  delete process.env.GITHUB_GUESTBOOK_REPO;
});

function getCreatedIssueBody(): string {
  const payload = JSON.parse(String(lastFetchInit?.body)) as { body: string };
  return payload.body;
}

describe('persisted visitor metadata', () => {
  it('does not persist IP-derived metadata in note issues', async () => {
    const { createPendingNoteIssue } = await import('@/lib/notes.server');

    await createPendingNoteIssue({
      kind: 'guestbook',
      message: 'A thoughtful note',
      name: 'Visitor',
      ip: '203.0.113.42',
    });

    const issueBody = getCreatedIssueBody();
    expect(issueBody).not.toContain('203.0.113.42');
    expect(issueBody).not.toMatch(/IP \(hashed\)|Metadata|Submitted:/);
  });

  it('persists only voluntary contact and pathname from feedback metadata', async () => {
    const { POST } = await import('@/app/api/feedback/route');
    const body = JSON.stringify({
      category: 'idea',
      message: 'Please add this useful feature.',
      contact: 'visitor@example.com',
      page: '/projects',
      theme: 'dark',
      viewport: '1920x1080',
      userAgent: 'Sensitive Browser Fingerprint',
    });
    const request = new NextRequest('https://whoisdhruv.com/api/feedback', {
      method: 'POST',
      headers: {
        origin: 'https://whoisdhruv.com',
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body)),
        'x-real-ip': '203.0.113.99',
      },
      body,
    });

    expect((await POST(request)).status).toBe(200);
    const issueBody = getCreatedIssueBody();
    expect(issueBody).toContain('**Contact:** visitor\\@example.com');
    expect(issueBody).toContain('**Page:** /projects');
    expect(issueBody).not.toContain('Sensitive Browser Fingerprint');
    expect(issueBody).not.toContain('1920x1080');
    expect(issueBody).not.toContain('203.0.113.99');
    expect(issueBody).not.toMatch(/User Agent|Viewport|Theme|IP \(hashed\)|Submitted:/);
  });
});