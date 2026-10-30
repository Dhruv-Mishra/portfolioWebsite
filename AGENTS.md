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

## Keeping The Codebase Small

- Reuse before adding: check `lib/designTokens.ts`, `lib/localPreference.ts`, `lib/boundedJson.server.ts`, `lib/replyLength.ts`, and existing hooks before writing a new helper, store, or constant.
- A change should usually delete about as much as it adds. Remove code, exports, flags, docs, and tests that a change makes obsolete in the same commit.
- Extract shared code only on the second real duplicate; prefer a small class or function with one responsibility over options-heavy abstractions.
- Tests must exercise behavior. Do not add tests that read source, CSS, YAML, or shell files as text; the only allowed exceptions are the design-token parity and action SHA-pinning guards.
- No new dependency without a measured need; prefer the platform or an existing package. Dev tooling that is not used by scripts or CI does not belong in `package.json`.
- Keep comments to what the code cannot say; no changelog-style or multi-paragraph narration in source.

## Tooling

- Use VS Code semantic search when wording or location is unknown; use VS Code search or native `rg` for exact symbols, strings, paths, regexes, and exhaustive matches.
- Prefer VS Code search, read, edit, and diagnostic tools over terminal equivalents. Run terminal commands directly with narrow native flags while preserving errors, warnings, paths, commands, and validation evidence.
- Keep shared guidance here and folder-specific guidance in the nearest `AGENTS.md`; do not repeat project context in agent definitions.
- Use Headroom only for large repetitive structured payloads when it shows material savings. Retrieve the original before decisions involving failures, security, exact values, or code changes.
- Keep Headroom proxy routing, output shaping, effort routing, failure learning, and automatic instruction writes disabled for VS Code Copilot Chat.
- See [docs/agent-setup.md](docs/agent-setup.md) for model, context, Headroom, and MCP setup.

## Commands

- `npm run dev` starts the app from the root.
- `npm run build` builds the app from the root and preserves pre/postbuild lifecycle scripts.
- `npm run lint` runs ESLint from the root.
- `npm run typecheck` runs TypeScript checks from the root.
- From `portfolio/`, use `npm test`; for targeted tests, use `npx vitest run <file> -t "<name>"`.

## Deployment Facts

- Staging uses `deployed/staging`, Docker image deploys, `staging.whoisdhruv.com`, service `portfolio-staging`, and port `3010`.
- Production lives at `whoisdhruv.com`. The production deploy branch is `deployed/production`; `dev/lkg` is the primary development branch.
- Runtime is Linux VMs behind Cloudflare and Nginx, running Next.js standalone output. Docker image mode is the default deploy path for staging and production.

## Cleanup Rules

- Safe cleanup targets are generated logs, temp screenshots, build transcripts, and local machine state.
- Do not remove runtime markdown routes, `portfolio/content/facts/**/*.md`, or `portfolio/lib/facts.embeddings.json` as generic docs cleanup.
- Store curated README screenshots in [docs/screenshots](docs/screenshots), not under `portfolio/tmp`.