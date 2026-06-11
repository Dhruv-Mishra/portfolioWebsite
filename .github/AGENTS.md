# Agent Guide

Scope: GitHub workflows, repository instructions, and agent definitions.

## Keep In Sync

- If package scripts or test tooling change, update `.github/agents/*.agent.md`, `.github/instructions/*.md`, [../AGENTS.md](../AGENTS.md), and [../CLAUDE.md](../CLAUDE.md) when relevant.
- Workflow facts must match `.github/workflows/*.yml`; do not document aspirational deploy behavior as current behavior.
- Runtime markdown under `portfolio/content/facts/**/*.md` is product content. Workflow path filters should not blanket-ignore all Markdown.

## Workflow Notes

- Staging deploys are guarded to `deployed/staging`.
- Production deploy workflow is guarded to `deployed/production`; `dev/lkg` is the primary development branch.
- Avoid secrets, VM hostnames, SSH details, and Cloudflare credentials in tracked docs.

## Agent Definition Notes

- Keep `.agent.md` files role-specific and concise.
- Prefer pointing agents to directory-level `AGENTS.md` over duplicating long project rules in every agent file.
- The app already uses Vitest; do not tell agents to bootstrap a new test framework unless component testing dependencies are intentionally added.