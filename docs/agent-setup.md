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
6. Install RTK's native Copilot integration with `rtk init -g --copilot --auto-patch`, restart VS Code, and keep `rg` on `PATH`. The hook applies to terminal calls from the main agent and subagents; explicit `rtk` prefixes remain the portable fallback.

Tool availability does not bypass VS Code approvals, workspace trust, extension state, or organization policy. Prompt text cannot auto-approve tools.

RTK 0.43.0's `init --show`, `verify`, and once-daily reminder inspect only the Claude hook, so a Copilot-only installation can misleadingly report "hook not installed." Verify Copilot separately by checking `~/.copilot/hooks/rtk-rewrite.json` and piping the documented `Bash` payload into `rtk hook copilot`; a successful result contains `updatedInput.command: "rtk git status"`.

## Token Practices

- RTK is the first compression layer for external terminal commands. Prefer VS Code's structured tools, which already return bounded output, and use direct PowerShell cmdlets when RTK cannot wrap them.
- Use `rtk git status|diff|log|show|branch|add|commit|push|pull` for Git. Apply `rtk --ultra-compact` to routine status, branch, and list output only; keep normal RTK output for diffs, failures, and diagnostics.
- From `portfolio/`, prefer `rtk vitest run`, `rtk lint`, `rtk tsc --noEmit --pretty false`, and `rtk playwright test`. Use `rtk vitest run <file> -t "<name>"` for focused tests.
- Use `rtk npm run build` for this app because npm must run `prebuild` embeddings and `postbuild` sanitization. Use `rtk npm run <script>` for other lifecycle-dependent scripts and package operations.
- Use `rtk rg`, `rtk read`, `rtk ls`, and `rtk find` for shell-based exploration. Use `rtk test <command>`, `rtk err <command>`, or `rtk summary <command>` only when no specialized adapter exists.
- RTK saves full failed-command output through its failure tee by default. Read the referenced tee file instead of rerunning a noisy failure raw.
- Check adoption with `rtk gain --history`; use `rtk discover --all --since 7` for supported session sources. Telemetry is optional and remains disabled unless explicitly enabled.
- Start a new chat for an unrelated task. Use `/fork` for an alternate approach and `/compact <focus>` when a long session accumulates stale context.
- Keep the model, effort, tools, MCP set, and instruction prefix stable within a task to preserve prompt-cache hits.
- Exclude generated output from search/indexing. Keep build logs and temporary screenshots outside agent context.
- Inspect per-turn credits, the context-window control, Agent Debug Logs, and Cache Explorer before adding another optimization layer.

## Headroom

The workspace registers Headroom 0.31 as an on-demand stdio MCP server in `.vscode/mcp.json`, using a `${userHome}`-resolved executable path with telemetry and background update checks disabled. Native VS Code Copilot Chat is not a documented `headroom wrap` target, so do not run a proxy or redirect model traffic. Keep output shaping and effort routing off; both can alter response behavior.

Headroom complements RTK rather than replacing it. RTK filters terminal output before it reaches an agent. Headroom is reserved for large repetitive JSON, structured logs, and API/database payloads that did not already pass through RTK. Its MCP call is explicit, originals remain retrievable by hash for one hour, and agents must retrieve exact content before exhaustive, security-sensitive, failure-sensitive, or code-changing decisions.

Do not call Headroom on every result. The installed pipeline intentionally passes through errors, code, grep results, short content, and payloads with no net reduction. In local verification, protected error data and representative 1.5K-token payloads produced 0% savings, while direct library diagnostics confirmed compression for larger root JSON arrays. Use a practical 4K-token floor and keep Headroom only when session stats show material savings without extra retrieval churn.

After changing `.vscode/mcp.json`, restart that MCP server or reload the VS Code window once. Verify with the Headroom stats tool; the proxy may remain unreachable because MCP-only compression is local and does not require it.

## Caveman

The reviewed Caveman projects are prompt-style compression conventions rather than a verified VS Code compression layer. Their useful behavior is already represented by the concise agent prompts and RTK rules.

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
- [RTK](https://github.com/rtk-ai/rtk)
- [Headroom](https://github.com/headroomlabs-ai/headroom)
- [Caveman Universal](https://github.com/terasites-ltda/caveman-universal)
- [Caveman UTC](https://github.com/leonardomg1/Caveman-UTC)
- [GitHub MCP Server](https://github.com/github/github-mcp-server)
- [Context7](https://github.com/upstash/context7)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)