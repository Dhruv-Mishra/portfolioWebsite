import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { RATE_LIMIT_CONFIG, GITHUB_API_VERSION, GITHUB_API_TIMEOUT_MS } from '@/lib/llmConfig';
import { validateOrigin } from '@/lib/validateOrigin';
import { sanitizeMarkdown } from '@/lib/markdownEscape';

export const prerender = false;

const feedbackRateLimiter = createServerRateLimiter({ ...RATE_LIMIT_CONFIG.feedback, maxTrackedIPs: 200, cleanupInterval: 30 });
const MAX_FEEDBACK_BODY_BYTES = 8_000;

const VALID_CATEGORIES = ['bug', 'idea', 'kudos', 'other'] as const;
type FeedbackCategory = typeof VALID_CATEGORIES[number];

const LABEL_MAP: Record<FeedbackCategory, string> = {
  bug: 'bug',
  idea: 'enhancement',
  kudos: 'kudos',
  other: 'feedback',
};

const TITLE_PREFIX: Record<FeedbackCategory, string> = {
  bug: 'Bug',
  idea: 'Idea',
  kudos: 'Kudos',
  other: 'Feedback',
};

interface FeedbackBody {
  category: FeedbackCategory;
  message: string;
  contact?: string;
  page?: string;
  theme?: string;
  viewport?: string;
  userAgent?: string;
}

function hashIP(ip: string): string {
  const salt = process.env.IP_HASH_SALT ?? 'sketchbook-default-ip-salt-v1';
  return createHash('sha256').update(salt).update(':').update(ip).digest('hex').slice(0, 16);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const originError = validateOrigin(request, { requireOrigin: true });
    if (originError) return originError;

    const ip = getClientIP(request);
    const { limited, retryAfter } = feedbackRateLimiter.check(ip);
    if (limited) {
      return Response.json(
        { error: `Too many feedback submissions. Try again in ${Math.ceil(retryAfter / 60)} minutes.` },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }

    const token = process.env.GITHUB_FEEDBACK_TOKEN;
    const repo = process.env.GITHUB_FEEDBACK_REPO;

    if (!token || !repo) {
      console.error('Missing GITHUB_FEEDBACK_TOKEN or GITHUB_FEEDBACK_REPO env vars');
      return Response.json({ error: 'Feedback service is not configured' }, { status: 500 });
    }

    const contentLength = Number(request.headers.get('content-length'));
    if (!Number.isFinite(contentLength)) {
      return Response.json({ error: 'Content-Length header required' }, { status: 411 });
    }
    if (contentLength > MAX_FEEDBACK_BODY_BYTES) {
      return Response.json({ error: 'Request body is too large' }, { status: 413 });
    }

    const body = await request.json().catch(() => null) as FeedbackBody | null;
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body.category || !VALID_CATEGORIES.includes(body.category)) {
      return Response.json({ error: 'Invalid category' }, { status: 400 });
    }

    const message = String(body.message || '').trim().slice(0, 1000);
    if (!message || message.length < 5) {
      return Response.json({ error: 'Message must be at least 5 characters' }, { status: 400 });
    }

    const sanitizedMessage = sanitizeMarkdown(message);
    const title = `[${TITLE_PREFIX[body.category]}] ${sanitizedMessage.slice(0, 60)}${sanitizedMessage.length > 60 ? '...' : ''}`;

    const contact = sanitizeMarkdown(String(body.contact || '').trim().slice(0, 120));
    const page = sanitizeMarkdown(String(body.page || 'Unknown'));
    const theme = sanitizeMarkdown(String(body.theme || 'Unknown'));
    const viewport = sanitizeMarkdown(String(body.viewport || 'Unknown'));
    const userAgent = sanitizeMarkdown(String(body.userAgent || 'Unknown'));

    const metadataLines = [
      `**Category:** ${TITLE_PREFIX[body.category]}`,
      ...(contact ? [`**Contact:** ${contact}`] : []),
      `**Page:** ${page}`,
      `**Theme:** ${theme}`,
      `**Viewport:** ${viewport}`,
      `**User Agent:** ${userAgent}`,
      `**Submitted:** ${new Date().toISOString()}`,
      `**IP (hashed):** ${hashIP(ip)}`,
    ];

    const issueBody = [
      '## Description',
      '',
      sanitizedMessage,
      '',
      '---',
      '',
      '<details><summary>Metadata</summary>',
      '',
      ...metadataLines,
      '',
      '</details>',
      '',
      '_Submitted via portfolio website feedback form_',
    ].join('\n');

    const ghController = new AbortController();
    const ghTimeout = setTimeout(() => ghController.abort(), GITHUB_API_TIMEOUT_MS);

    let ghResponse: Response;
    try {
      ghResponse = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          body: issueBody,
          labels: [LABEL_MAP[body.category], 'website-feedback'],
        }),
        signal: ghController.signal,
      });
    } catch (error) {
      clearTimeout(ghTimeout);
      console.error('GitHub API timeout/network error:', error);
      return Response.json({ error: 'Feedback service timed out. Please try again later.' }, { status: 504 });
    }
    clearTimeout(ghTimeout);

    if (!ghResponse.ok) {
      const errText = await ghResponse.text().catch(() => 'Unknown error');
      console.error(`GitHub API error (${ghResponse.status}):`, errText);
      return Response.json({ error: 'Failed to submit feedback. Please try again later.' }, { status: 502 });
    }

    const issue = await ghResponse.json() as { number?: number };
    return Response.json({ success: true, issueNumber: issue.number, message: 'Feedback submitted successfully!' });
  } catch (error) {
    console.error('Feedback API error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
};