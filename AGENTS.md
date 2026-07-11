# Agent Guide

Scope: the whole repository.

## Orientation

- The production app lives in [portfolio](portfolio). The workspace root only wraps common npm scripts.
- Do not add a root `package-lock.json`; the real lockfile is [portfolio/package-lock.json](portfolio/package-lock.json).
- Read the nearest directory-level `AGENTS.md` before editing a file. More specific files override this one.
- Keep public docs concise. Put operational detail in [portfolio/README.md](portfolio/README.md) or a focused docs file.

## Agent Workflow

- `Lead` (GPT-5.6 Sol, XHIGH intent) owns complex or ambiguous work and the final result.
- `Builder` (GPT-5.6 Terra, HIGH intent) implements scoped changes end to end.
- `Fastlane` (GPT-5.6 Luna, HIGH intent) handles bounded exploration, diagnostics, mechanical work, command output, testing, and verification.
- For non-trivial packetizable work, Lead delegates settled implementation to Builder and bounded evidence work to Fastlane. Keep Sol focused on architecture, decomposition, ambiguity, integration, and final acceptance.
- Fan out multiple Builder or Fastlane instances only for independent slices. Pass compact task packets with anchors, fixed decisions, ownership, edit permission, acceptance checks, and expected evidence; serialize writers that share files or unresolved contracts.
- Route downward by default: Lead can invoke Builder/Fastlane, Builder can use Fastlane for a bounded assist, and Fastlane does not spawn subagents.
- Agent files omit restrictive tool allowlists so VS Code supplies its current default tools dynamically. Actual execution remains subject to workspace trust, approval settings, tool availability, and organization policy.
- Start from a concrete anchor, make focused edits, validate after the first substantive edit, and repair failures before widening scope.

## Token Discipline

- Prefer VS Code search/read/edit tools over terminal equivalents.
- RTK's global Copilot hook rewrites supported terminal commands automatically, including subagent calls. Still write the `rtk` prefix explicitly so behavior degrades safely when hooks are unavailable.
- Use specialized adapters when possible: `rtk git ...`, `rtk vitest run`, `rtk lint`, `rtk tsc`, `rtk playwright test`, `rtk rg`, and `rtk read`. Use `rtk npm run ...` when npm lifecycle scripts matter and `rtk test <command>` or `rtk err <command>` as fallbacks.
- Use `rtk --ultra-compact` only for routine status/list output. Keep normal RTK output for diffs, diagnostics, failures, and anything where exact detail matters.
- Use direct PowerShell cmdlets when RTK cannot wrap them.
- Keep output filtered while preserving errors, warnings, paths, commands, and validation evidence.
- Do not duplicate project context in agent files. Read the nearest `AGENTS.md` and linked docs on demand.
- Use the fewest agents whose isolation saves more Sol context or elapsed time than the handoff costs; never invoke every role by ritual.
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