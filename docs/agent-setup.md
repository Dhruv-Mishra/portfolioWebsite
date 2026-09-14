# Copilot Agent Setup

This repository uses four VS Code custom agents. Role contracts define responsibilities and outcomes; agents choose their methods within the shared scope, permission, and safety rules in [AGENTS.md](../AGENTS.md).

| Agent | Requested model | Effort | Use |
|---|---|---|---|
| Lead | GPT-5.6 Sol (copilot) | High | User outcome, planning, architecture, coordination, integration, final acceptance |
| Builder | Gemini 3.8 Flash (copilot) | High | Implementation of scoped features, fixes, tests, and documentation |
| Fastlane | GPT-5.6 Luna (copilot) | Max | Bounded investigation, research, diagnostics, and checks |
| God | GPT-6 Astra (copilot) | High | Deepest reasoning on difficult or consequential architecture, correctness, and diagnostic questions |

All roles are user-invocable. Only Lead delegates to `God`, `Builder`, or `Fastlane`; the other roles have no subagents. Lead chooses direct work or delegation by expected value and owns integration and final acceptance.

The shared guide defines assignment permissions and ownership. Fastlane is read-only by default. God produces decisions or explicitly authorized artifacts. Lead evaluates specialist results against evidence; recommendations inform rather than replace its judgment.

## VS Code Setup

1. Use VS Code 1.128.0 or newer. In **Chat: Manage Language Models** and the model picker, confirm the four requested models in the table are available and enabled. Astra and Gemini catalogue availability is not verified by this repository configuration.
2. Each agent frontmatter explicitly requests its table model and `reasoning-effort`: High for Astra, Sol, and Flash; Max for Luna. The selected model must support that effort. There are no fallback model arrays, so VS Code must not silently select a different model.
3. For Astra, Sol, and Luna, open the VS Code picker context control and confirm the normal default context is selected, not `1M`. This is a manual setup requirement: no supported workspace or agent-frontmatter field enforces a context selection.
4. Trust the workspace. In **Configure Tools**, select tools as needed. All four roles omit `tools` to retain VS Code's dynamic defaults. Tool availability never bypasses workspace trust, approvals, extension state, or organization policy.
5. Use flat routing: Lead may invoke God, Builder, and Fastlane; all other roles invoke no subagents. Use **Chat: Open Customizations** and Chat diagnostics after changing an agent, model, MCP server, or instruction file.

## Context Practices

- Prefer VS Code's structured tools and direct, narrowly scoped terminal commands. Keep exact failures and diagnostics available.
- Start a new chat for unrelated work; use `/fork` for alternatives and `/compact <focus>` when stale context accumulates.
- Keep the model, effort, tools, MCP set, and instruction prefix stable within a task to preserve prompt-cache hits.
- Exclude generated output, build logs, and temporary screenshots from agent context.
- Use Agent Debug Logs and Cache Explorer to measure context or cache problems before adding optimization layers.

## Zvec-Grep Workspace Search

The repository pins `@zvec/zvec-grep` as development tooling. It combines ranked lexical and local vector retrieval for source, documentation, configuration, and curated fact Markdown. It improves evidence discovery and can reduce agent tool calls or context usage; it does not make the underlying LLM faster.

From the repository root, create the machine-local index once and start the loopback MCP server:

```powershell
npm ci --prefix portfolio
npm run search:index
npm run search:server
```

The initial index uses `local/potion-code-16m-v2`. Repository content and queries stay on the machine, the model cache stays under the user's zvec-grep home, and `.zvec-grep/` remains untracked. Do not grant remote embedding access or store provider credentials in the repository.

Use `npm run search:query -- "where theme preferences are restored"` for terminal search, `npm run search:status` for index readiness, and `npm run search:update` for an explicit incremental refresh. `npm run search:server:status` checks MCP readiness; `npm run search:server:stop` stops the daemon. Active daemon workspaces use file watching and periodic reconciliation, so indexing is intentionally not attached to a Git hook.

The checked-in `.vscode/mcp.json` connects to `http://127.0.0.1:7999/mcp` with zvec-grep's search-only agent toolset. Reload VS Code or start a new chat after first setup. Use semantic or hybrid retrieval when the location or wording is unknown and native search for exact identifiers, strings, paths, regexes, or exhaustive matches.

Keep separate indexes for Windows and Linux/WSL working copies. Do not run daemons from both environments against the same `.zvec-grep/` directory.

Zvec is not used by the website's runtime facts RAG. That corpus currently contains 34 facts and already uses a committed embedding bundle, content-hash reuse, query caching, and a tiny in-memory cosine scan. Reconsider a vector database only after corpus growth or measured retrieval latency or quality demonstrates a need.

## Headroom

The workspace registers Headroom 0.31 as an on-demand stdio MCP server in `.vscode/mcp.json`, with telemetry and background update checks disabled. Do not proxy or redirect VS Code Copilot Chat traffic, and keep output shaping and effort routing off.

Reserve Headroom for repetitive structured payloads above roughly 4K tokens when it shows material savings. Skip errors, code, diffs, search results, and short content; retrieve the original by hash before exact, security-sensitive, failure-sensitive, or code-changing decisions.

After changing `.vscode/mcp.json`, restart that MCP server or reload the VS Code window once. Verify with the Headroom stats tool; the proxy may remain unreachable because MCP-only compression is local and does not require it.

## MCP Shortlist

MCP tools add schemas and call output to context, so enable a server only while its external domain is needed.

1. **GitHub MCP Server**: highest-value addition for issues, pull requests, Actions, releases, and code-security data. Prefer GitHub's remote OAuth endpoint. Enable only needed toolsets instead of `all` to reduce tool-selection context.
2. **Context7**: useful for current, version-specific Next.js, React, Tailwind, and library documentation. Prefer its CLI + skill mode where supported because it avoids persistent MCP schemas; otherwise enable the two-tool MCP only for library/API work.
3. **Playwright CLI + skills**: preferred for repeatable browser checks. Microsoft explicitly describes CLI + skills as more token-efficient than Playwright MCP. Use Playwright MCP only for long-lived exploratory browser state.
4. **Chrome DevTools MCP**: use for performance traces, network debugging, Lighthouse, and heap analysis. For basic browser work use `--slim`; use isolated profiles and compressed/downscaled screenshots. Disable usage statistics and CrUX lookup when those data flows are unwanted.

Do not add filesystem, generic memory, sequential-thinking, or duplicate fetch/search MCP servers. VS Code already provides those capabilities, and duplicate tools increase prompt size and tool-selection ambiguity. Local MCP sandboxing is not available on Windows, so run only trusted servers and avoid browsing sensitive sessions through browser MCPs.

## Sources

- [VS Code custom agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents)
- [VS Code subagents](https://code.visualstudio.com/docs/copilot/agents/subagents)
- [VS Code context engineering](https://code.visualstudio.com/docs/copilot/guides/context-engineering-guide)
- [VS Code usage optimization](https://code.visualstudio.com/docs/copilot/guides/optimize-usage)
- [GitHub Copilot model comparison](https://docs.github.com/en/copilot/reference/ai-models/model-comparison)
- [Headroom](https://github.com/headroomlabs-ai/headroom)
- [GitHub MCP Server](https://github.com/github/github-mcp-server)
- [Context7](https://github.com/upstash/context7)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)