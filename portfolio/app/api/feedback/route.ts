// app/api/feedback/route.ts — Server-side proxy for GitHub Issues feedback
import { NextRequest } from 'next/server';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';

export const runtime = 'nodejs';

const feedbackRateLimiter = createServerRateLimiter({ maxRequests: 3, windowMs: 3_600_000, maxTrackedIPs: 200, cleanupInterval: 30 });

// ─── Validation ─────────────────────────────────────────────────────────
const VALID_CATEGORIES = ['bug', 'idea', 'kudos', 'other'] as const;
type FeedbackCategory = typeof VALID_CATEGORIES[number];

const LABEL_MAP: Record<FeedbackCategory, string> = {
  bug: 'bug',
  idea: 'enhancement',
  kudos: 'kudos',
  other: 'feedback',
};

const TITLE_PREFIX: Record<FeedbackCategory, string> = {
  bug: '🐛 Bug',
  idea: '💡 Idea',
  kudos: '💜 Kudos',
  other: '📝 Feedback',
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

export async function POST(request: NextRequest) {
  try {
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

    const body: FeedbackBody = await request.json();

    // Validate category
    if (!body.category || !VALID_CATEGORIES.includes(body.category)) {
      return Response.json({ error: 'Invalid category' }, { status: 400 });
    }

    // Validate message
    const message = String(body.message || '').trim().slice(0, 1000);
    if (!message || message.length < 5) {
      return Response.json({ error: 'Message must be at least 5 characters' }, { status: 400 });
    }

    // Build GitHub issue
    const title = `[${TITLE_PREFIX[body.category]}] ${message.slice(0, 60)}${message.length > 60 ? '...' : ''}`;

    const contact = String(body.contact || '').trim().slice(0, 120);

    const metadataLines = [
      `**Category:** ${TITLE_PREFIX[body.category]}`,
      ...(contact ? [`**Contact:** ${contact}`] : []),
      `**Page:** ${body.page || 'Unknown'}`,
      `**Theme:** ${body.theme || 'Unknown'}`,
      `**Viewport:** ${body.viewport || 'Unknown'}`,
      `**User Agent:** ${body.userAgent || 'Unknown'}`,
      `**Submitted:** ${new Date().toISOString()}`,
      `**IP (hashed):** ${hashIP(ip)}`,
    ];

    const issueBody = [
      '## Description',
      '',
      message,
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

    // Create GitHub issue
    const ghResponse = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body: issueBody,
        labels: [LABEL_MAP[body.category], 'website-feedback'],
      }),
    });

    if (!ghResponse.ok) {
      const errText = await ghResponse.text().catch(() => 'Unknown error');
      console.error(`GitHub API error (${ghResponse.status}):`, errText);
      return Response.json(
        { error: 'Failed to submit feedback. Please try again later.' },
        { status: 502 },
      );
    }

    const issue = await ghResponse.json();

    return Response.json({
      success: true,
      issueNumber: issue.number,
      message: 'Feedback submitted successfully!',
    });
  } catch (err) {
    console.error('Feedback API error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Simple hash of IP for privacy — not reversible, just for dedup in issue body */
function hashIP(ip: string): string {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
