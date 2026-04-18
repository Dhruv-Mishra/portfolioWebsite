import 'server-only';

/**
 * Shared GitHub-issue-backed note store.
 *
 * Used by TWO surfaces:
 *   - `/guestbook` (kind: "guestbook") — the longstanding visitor wall.
 *   - `/matrix-notes` (kind: "matrix") — the secret post-escape notes wall,
 *     unlocked only by clicking ESCAPE THE MATRIX inside the matrix overlay.
 *
 * Why share instead of forking? Both surfaces have the same storage needs:
 *   - A pending-review queue + human approval step via a GitHub label flip.
 *   - Input validation (length, URL-ban, honeypot) at the route level.
 *   - Markdown-escaping to neuter injection on the issue body we render.
 *   - IP hashing for abuse tracking without storing real IPs.
 *
 * Parameterizing the labels + env var names is the ONLY difference between
 * the two surfaces. Extracting this module means we rate-limit identically,
 * sanitize identically, and have exactly one place to fix any future bug
 * that affects the issue-body parse or the sanitization rules.
 *
 * Contract:
 *   - `kind` is the discriminator — "guestbook" or "matrix".
 *   - Each kind reads its own `GITHUB_{KIND}_REPO` / `GITHUB_{KIND}_TOKEN` env
 *     pair, with the existing guestbook env vars as the legacy fallback so
 *     live deployments keep working without re-provisioning. Matrix notes
 *     re-use the guestbook repo by default (falling back through the same
 *     chain guestbook uses today).
 *   - Pending label is `{kind}-pending`; approved label is `{kind}-approved`.
 *     Dhruv relabels `pending → approved` from the GitHub UI to publish.
 *   - Issue body shape is the SAME across kinds so `parseIssueBody` in
 *     `lib/guestbook.ts` handles both.
 */

import { GITHUB_API_VERSION, GITHUB_API_TIMEOUT_MS } from '@/lib/llmConfig';
import { parseIssueBody, type GuestbookEntry } from '@/lib/guestbook';

/** Note kind discriminator. Controls label names + env var lookup. */
export type NoteKind = 'guestbook' | 'matrix';

/** Escape markdown-injection characters by backslash-prefixing them. */
function sanitizeMarkdown(str: string): string {
  return str.replace(/[\[\]()@`|#*_!<>]/g, (ch) => `\\${ch}`);
}

/** Privacy-preserving IP hash — same djb2-ish shape used by the feedback route. */
function hashIP(ip: string): string {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Resolve the GitHub repo for the given note kind. Falls back to the
 * guestbook/feedback env chain so matrix notes deploy zero-config on top
 * of an existing guestbook install. Returns undefined if nothing is set —
 * callers should 500 with a "not configured" message in that case.
 */
export function resolveNotesRepo(kind: NoteKind): string | undefined {
  if (kind === 'matrix') {
    return (
      process.env.GITHUB_MATRIX_NOTES_REPO ??
      process.env.GITHUB_GUESTBOOK_REPO ??
      process.env.GITHUB_FEEDBACK_REPO
    );
  }
  // guestbook
  return process.env.GITHUB_GUESTBOOK_REPO ?? process.env.GITHUB_FEEDBACK_REPO;
}

/** Resolve the GitHub token for the given note kind — same fallback chain. */
export function resolveNotesToken(kind: NoteKind): string | undefined {
  if (kind === 'matrix') {
    return (
      process.env.GITHUB_MATRIX_NOTES_TOKEN ??
      process.env.GITHUB_GUESTBOOK_TOKEN ??
      process.env.GITHUB_FEEDBACK_TOKEN
    );
  }
  return process.env.GITHUB_GUESTBOOK_TOKEN ?? process.env.GITHUB_FEEDBACK_TOKEN;
}

function pendingLabel(kind: NoteKind): string {
  return kind === 'matrix' ? 'matrix-notes-pending' : 'guestbook-pending';
}

function approvedLabel(kind: NoteKind): string {
  return kind === 'matrix' ? 'matrix-notes-approved' : 'guestbook-approved';
}

function issuePrefix(kind: NoteKind): string {
  return kind === 'matrix' ? '[matrix-notes]' : '[guestbook]';
}

interface CreatePendingIssueArgs {
  kind: NoteKind;
  message: string;
  name: string;
  ip: string;
}

/**
 * Create a `{kind}-pending` GitHub issue. Dhruv relabels to `{kind}-approved`
 * from the GitHub UI to surface the entry on the wall.
 *
 * Throws on network failure / non-2xx response. 10s upstream timeout via
 * AbortController. Sanitizes markdown-injection vectors on both the message
 * and the signer name before embedding them into the issue body.
 */
export async function createPendingNoteIssue({
  kind,
  message,
  name,
  ip,
}: CreatePendingIssueArgs): Promise<void> {
  const repo = resolveNotesRepo(kind);
  const token = resolveNotesToken(kind);
  if (!repo || !token) {
    throw new Error(`${kind} notes not configured`);
  }

  const sanitizedMessage = sanitizeMarkdown(message);
  const sanitizedName = sanitizeMarkdown(name || 'Anonymous');

  const title =
    `${issuePrefix(kind)} ${sanitizedMessage.slice(0, 50)}${sanitizedMessage.length > 50 ? '...' : ''}`;

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
    `**Kind:** ${kind}`,
    '',
    '</details>',
    '',
    `_Submitted via portfolio website ${kind === 'matrix' ? 'matrix-notes' : 'guestbook'}_`,
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
        labels: [pendingLabel(kind)],
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
 * Fetch all `{kind}-approved` GitHub issues, parse bodies, and return a clean
 * entry list. Used by the wall SSR render — invokes GitHub directly (not our
 * own GET route) to save a hop during `revalidate` regeneration.
 *
 * Returns an empty list on misconfig or upstream failure — the wall falls back
 * to the empty state rather than crashing the whole page.
 */
export async function getApprovedNotes(kind: NoteKind): Promise<GuestbookEntry[]> {
  const repo = resolveNotesRepo(kind);
  const token = resolveNotesToken(kind);
  if (!repo || !token) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GITHUB_API_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/issues?labels=${approvedLabel(
        kind,
      )}&state=open&per_page=50&sort=created&direction=desc`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
        },
        signal: controller.signal,
        // Opt out of fetch cache — `revalidate` on the wall page is the cache boundary.
        cache: 'no-store',
      },
    );

    if (!res.ok) {
      console.error(`[${kind}] GitHub list issues failed (${res.status})`);
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
    console.error(`[${kind}] getApprovedNotes failed:`, err);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
