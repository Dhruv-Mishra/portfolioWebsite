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

- Write concise role contracts: responsibilities, desired outcomes, and hard guardrails. Let agents choose their methods.
- Keep shared permissions and operating rules in root and directory-level `AGENTS.md` rather than repeating them in agent bodies.
- Keep the `Lead`, `Builder`, `Fastlane`, and `God` contracts consistent with the root guide and [agent setup](../docs/agent-setup.md).
- Preserve configured models, efforts, invocation flags, and flat delegation metadata. All four roles omit `tools` to inherit VS Code's configured defaults; tool access remains subject to trust, approvals, and organization policy.
- The app already uses Vitest; do not tell agents to bootstrap a new test framework unless component testing dependencies are intentionally added.