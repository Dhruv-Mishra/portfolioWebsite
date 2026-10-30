# Agent Guide

Scope: GitHub workflows, repository instructions, and agent definitions.

## Keep In Sync

- If package scripts or test tooling change, update the nearest `AGENTS.md` or package documentation. Keep agent bodies role-specific.
- Workflow facts must match `.github/workflows/*.yml`; do not document aspirational deploy behavior as current behavior.
- Runtime markdown under `portfolio/content/facts/**/*.md` is product content. Workflow path filters should not blanket-ignore all Markdown.

## Workflow Notes

- Staging deploys are guarded to `deployed/staging`.
- Production deploy workflow is guarded to `deployed/production`; `dev/lkg` is the primary development branch.
- Node setup and `npm ci` go through `.github/actions/setup-portfolio`; do not inline them again.
- Pin every third-party action to a full commit SHA (enforced by `lib/__tests__/workflowSecurity.test.ts`).
- CI job names (`Lint`, `Typecheck`, `Test`, `Build`) are branch-protection checks; renaming them requires a settings change.
- Keep warning-only probes (model canaries) out of the deploy critical path; `deploy.sh` owns per-host health and rollback.
- Avoid secrets, VM hostnames, SSH details, and Cloudflare credentials in tracked docs.

## Agent Definition Notes

- Keep role contracts concise and consistent with the root guide and [agent setup](../docs/agent-setup.md); keep shared rules out of agent bodies.
- Preserve configured models, efforts, invocation flags, flat delegation metadata, and omitted `tools` fields.
- The app already uses Vitest; do not tell agents to bootstrap a new test framework unless component testing dependencies are intentionally added.