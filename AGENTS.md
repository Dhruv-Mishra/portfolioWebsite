# Agent Guide

Scope: the whole repository.

## Orientation

- The production app lives in [portfolio](portfolio). The workspace root only wraps common npm scripts.
- Do not add a root `package-lock.json`; the real lockfile is [portfolio/package-lock.json](portfolio/package-lock.json).
- Read the nearest directory-level `AGENTS.md` before editing a file. More specific files override this one.
- Keep public docs concise. Put operational detail in [portfolio/README.md](portfolio/README.md) or a focused docs file.

## Agent Workflow

- Lead owns coordination, architecture, integration, and final acceptance; Builder owns implementation; Fastlane owns bounded investigation and checks; God owns the deepest reasoning on difficult or consequential questions. Model and effort settings live in [docs/agent-setup.md](docs/agent-setup.md).
- Choose direct work or delegation by expected value. Only Lead delegates; other roles return their work to Lead or the requesting user.
- Assignments define the objective, relevant evidence, constraints, owned scope, edit permission, and acceptance criteria. Work within the authority granted by the user or Lead; obtain approval before expanding scope or edit permission.
- Parallelize independent work with non-overlapping write ownership; serialize dependent decisions and shared-file edits.
- Ground changes in concrete evidence and local patterns. Keep changes focused and validate affected behavior with checks proportionate to risk; report results and remaining uncertainty.
- Preserve unrelated user work and keep secrets out of output and tracked files. Destructive Git operations, deployment, publishing, commits, and pushes require explicit user authorization.
- For UI work, preserve sketchbook language, hidden discovery layer, accessibility, themes, and mobile behavior; validate relevant viewport and theme states.

## Token Discipline

- Prefer VS Code search/read/edit tools over terminal equivalents.
- RTK's global Copilot hook rewrites supported terminal commands automatically, including subagent calls. Still write the `rtk` prefix explicitly so behavior degrades safely when hooks are unavailable.
- Use specialized adapters when possible: `rtk git ...`, `rtk vitest run`, `rtk lint`, `rtk tsc`, `rtk playwright test`, `rtk rg`, and `rtk read`. Use `rtk npm run ...` when npm lifecycle scripts matter and `rtk test <command>` or `rtk err <command>` as fallbacks.
- Use `rtk --ultra-compact` only for routine status/list output. Keep normal RTK output for diffs, diagnostics, failures, and anything where exact detail matters.
- Use direct PowerShell cmdlets when RTK cannot wrap them.
- Keep output filtered while preserving errors, warnings, paths, commands, and validation evidence.
- Do not duplicate project context in agent files. Read the nearest `AGENTS.md` and linked docs on demand.
- RTK remains the first compression layer for terminal output. Headroom complements it for large non-terminal payloads; it never replaces explicit `rtk` prefixes.
- Use Headroom on demand only for roughly 4K+ token repetitive JSON arrays, structured logs, API/database results, or other content where compression reports material savings. Skip short content, source code, diffs, grep/search results, requirements, and already-compact RTK output.
- Treat compressed content as an index, not exact evidence. Keep its retrieval hash and retrieve the original before exhaustive work or any decision involving errors, security, exact values, identifiers, paths, line references, commands, or code changes. If compression saves nothing or relevance is uncertain, use the original.
- Do not enable Headroom proxy routing, output shaping, effort routing, failure learning, or automatic instruction writes for native VS Code Copilot Chat. Check Headroom stats only after substantial tool-heavy work, not after every call.
- See [docs/agent-setup.md](docs/agent-setup.md) for model effort, tool, compression, and MCP setup notes.

## Commands

- `rtk npm run dev` starts the app from the root.
- `rtk npm run build` builds the app from the root and preserves pre/postbuild lifecycle scripts.
- `rtk npm run lint` runs ESLint from the root.
- `rtk npm run typecheck` runs TypeScript checks from the root.
- From `portfolio/`, `rtk vitest run` runs the canonical suite. For targeted tests, use `rtk vitest run <file> -t "<name>"`.

## Deployment Facts

- Staging uses `deployed/staging`, Docker image deploys, `staging.whoisdhruv.com`, service `portfolio-staging`, and port `3010`.
- Production lives at `whoisdhruv.com`. The production deploy branch is `deployed/production`; `dev/lkg` is the primary development branch.
- Runtime is Linux VMs behind Cloudflare and Nginx, running Next.js standalone output. Docker image mode is the default deploy path for staging and production.

## Cleanup Rules

- Safe cleanup targets are generated logs, temp screenshots, build transcripts, and local machine state.
- Do not remove runtime markdown routes, `portfolio/content/facts/**/*.md`, or `portfolio/lib/facts.embeddings.json` as generic docs cleanup.
- Store curated README screenshots in [docs/screenshots](docs/screenshots), not under `portfolio/tmp`.