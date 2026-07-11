# Copilot Agent Setup

This repository uses three VS Code custom agents. The small roster keeps context isolated without paying for a mandatory planning, implementation, test, review, audit, and documentation chain on every task.

| Agent | Model | Effort intent | Use |
|---|---|---|---|
| Lead | GPT-5.6 Sol | XHIGH | Complex reasoning, architecture, ambiguous debugging, orchestration, and final ownership |
| Builder | GPT-5.6 Terra | HIGH | Balanced implementation, tests, docs, and repair loops |
| Fastlane | GPT-5.6 Luna | HIGH | Bounded research, mechanical work, command output, and verification |

Use Lead for complex work. Lead should delegate non-trivial work whenever it can form a bounded packet: settled implementation goes to Builder, while exploration, code-path discovery, error analysis, commands, tests, and verification go to Fastlane. Select Builder directly for already-scoped implementation and Fastlane directly for bounded work.

Use multiple cheap agents when two or more work items are independent: separate Fastlane instances can inspect different code paths or run separate checks, and separate Builders can own non-overlapping implementation slices with fixed interfaces. Serialize agents that edit the same files or depend on an unresolved shared contract. Do not invoke all three roles by ritual; each subagent has an independent context and consumes credits, so the saved Sol context or elapsed time must exceed the handoff cost.

Do not add permanent Oracle or Architect agents. Sol/Lead already owns architecture, tradeoffs, decomposition, conflict resolution, and final acceptance; a renamed duplicate would add prompt and routing overhead without model diversity. For high-blast-radius or hard-to-reverse work, Lead should write or consume an explicit plan before delegating implementation.

## VS Code Setup

1. Use VS Code 1.128.0 or newer and enable all three GPT-5.6 models in **Chat: Manage Language Models**.
2. Open each model's picker submenu and select **XHIGH** for Sol when offered, and **HIGH** for Terra and Luna. VS Code remembers effort per model/session. `.agent.md` has no documented effort property, so adding `effort:` would be inert or invalid.
3. Trust the workspace. In **Configure Tools**, select all tools that agents may use. The agent files intentionally omit `tools`, which avoids a restrictive or stale allowlist and uses VS Code's dynamic defaults.
4. Use downward routing: Lead may invoke Builder and Fastlane; Builder may invoke Fastlane only for a bounded discovery or verification assist; Fastlane invokes no subagents. This prevents cheap workers from routing routine work back to Sol.
5. Use **Chat: Open Customizations** and Chat diagnostics after changing an agent, model, MCP server, or instruction file.
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