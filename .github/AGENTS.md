# Agent Guide

Scope: GitHub workflows, repository instructions, and agent definitions.

## Keep In Sync

- If package scripts or test tooling change, update the nearest `AGENTS.md` or package documentation. Keep agent bodies role-specific.
- Workflow facts must match `.github/workflows/*.yml`; do not document aspirational deploy behavior as current behavior.
- Runtime markdown under `portfolio/content/facts/**/*.md` is product content. Workflow path filters should not blanket-ignore all Markdown.

## Workflow Notes

- Staging deploys are guarded to `deployed/staging`.
- Production deploy workflow is guarded to `deployed/production`; `dev/lkg` is the primary development branch.
- Avoid secrets, VM hostnames, SSH details, and Cloudflare credentials in tracked docs.

## Agent Definition Notes

- Keep `.agent.md` files role-specific and concise.
- Prefer pointing agents to directory-level `AGENTS.md` over duplicating long project rules in every agent file.
- Keep the active roster to `Lead`, `Builder`, and `Fastlane`; add a role only when it provides a durable capability boundary.
- Do not add restrictive per-agent tool lists. Permissions are still controlled by VS Code, not prompt text.
- The app already uses Vitest; do not tell agents to bootstrap a new test framework unless component testing dependencies are intentionally added.