import 'server-only';

/**
 * Guestbook — server-only helpers.
 *
 * - `createPendingIssue`: POST a new GitHub issue with `guestbook-pending` label (called from
 *   the POST API route on submit). Dhruv manually reviews these and relabels to
 *   `guestbook-approved` to surface them on the wall.
 * - `getApprovedEntries`: fetch all `guestbook-approved` issues, parse bodies, and return the
 *   shape that the wall SSR render needs. Hits GitHub directly (not our own /api/guestbook)
 *   to save one hop during server rendering.
 */

import { GITHUB_API_VERSION, GITHUB_API_TIMEOUT_MS } from '@/lib/llmConfig';
import { parseIssueBody, type GuestbookEntry } from '@/lib/guestbook';

/** Escape markdown-injection characters by backslash-prefixing them. */
function sanitizeMarkdown(str: string): string {
  return str.replace(/[\[\]()@`|#*_!<>]/g, (ch) => `\\${ch}`);
}

/** Read the guestbook repo from env (falls back to the shared feedback repo). */
export function resolveGuestbookRepo(): string | undefined {
  return process.env.GITHUB_GUESTBOOK_REPO ?? process.env.GITHUB_FEEDBACK_REPO;
}

/** Read the guestbook token from env (falls back to the shared feedback token). */
export function resolveGuestbookToken(): string | undefined {
  return process.env.GITHUB_GUESTBOOK_TOKEN ?? process.env.GITHUB_FEEDBACK_TOKEN;
}

/** Privacy-preserving IP hash — mirrors the feedback route helper. */
function hashIP(ip: string): string {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

interface CreatePendingIssueArgs {
  message: string;
  name: string;
  ip: string;
}

/**
 * Create a `guestbook-pending` GitHub issue. Dhruv relabels to `guestbook-approved`
 * from the GitHub UI to surface the entry on the wall.
 *
 * Throws on network failure / non-2xx response. 10s upstream timeout via AbortController.
 */
export async function createPendingIssue({ message, name, ip }: CreatePendingIssueArgs): Promise<void> {
  const repo = resolveGuestbookRepo();
  const token = resolveGuestbookToken();
  if (!repo || !token) {
    throw new Error('Guestbook not configured');
  }

  const sanitizedMessage = sanitizeMarkdown(message);
  const sanitizedName = sanitizeMarkdown(name || 'Anonymous');

  const title = `[guestbook] ${sanitizedMessage.slice(0, 50)}${sanitizedMessage.length > 50 ? '...' : ''}`;

  const issueBody = [
    '## Message',
    '',
    sanitizedMessage,
    '',
    '## Name',
    '',
    sanitizedName,
    '',
    '---',
    '',
    '<details><summary>Metadata</summary>',
    '',
    `**Submitted:** ${new Date().toISOString()}`,
    `**IP (hashed):** ${hashIP(ip)}`,
    '',
    '</details>',
    '',
    '_Submitted via portfolio website guestbook_',
  ].join('\n');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GITHUB_API_TIMEOUT_MS);

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body: issueBody,
        labels: ['guestbook-pending'],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(`GitHub API error (${res.status}): ${errText}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

interface GitHubIssueSummary {
  number: number;
  body: string | null;
  created_at: string;
}

/**
 * Fetch all `guestbook-approved` GitHub issues, parse bodies, and return a clean entry list.
 * Used by the wall SSR render — invokes GitHub directly (not our own GET route) to save
 * a hop during `revalidate = 60` regeneration.
 *
 * Returns an empty list on misconfig or upstream failure — the wall falls back to the empty
 * state rather than crashing the whole page.
 */
export async function getApprovedEntries(): Promise<GuestbookEntry[]> {
  const repo = resolveGuestbookRepo();
  const token = resolveGuestbookToken();
  if (!repo || !token) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GITHUB_API_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/issues?labels=guestbook-approved&state=open&per_page=50&sort=created&direction=desc`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
        },
        signal: controller.signal,
        // Opt out of fetch cache — `revalidate = 60` on the wall page is the cache boundary.
        cache: 'no-store',
      },
    );

    if (!res.ok) {
      console.error(`[guestbook] GitHub list issues failed (${res.status})`);
      return [];
    }

    const issues = (await res.json()) as GitHubIssueSummary[];
    return issues.map((issue) => {
      const { message, name } = parseIssueBody(issue.body ?? '');
      return {
        id: issue.number,
        message,
        name,
        createdAt: issue.created_at,
      };
    });
  } catch (err) {
    console.error('[guestbook] getApprovedEntries failed:', err);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
