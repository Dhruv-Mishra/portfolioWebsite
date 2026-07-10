# Copilot Agent Setup

This repository uses three VS Code custom agents. The small roster keeps context isolated without paying for a mandatory planning, implementation, test, review, audit, and documentation chain on every task.

| Agent | Model | Effort intent | Use |
|---|---|---|---|
| Lead | GPT-5.6 Sol | XHIGH | Complex reasoning, architecture, ambiguous debugging, orchestration, and final ownership |
| Builder | GPT-5.6 Terra | HIGH | Balanced implementation, tests, docs, and repair loops |
| Fastlane | GPT-5.6 Luna | HIGH | Bounded research, mechanical work, command output, and verification |

Use Lead for complex work and let it delegate conditionally. Select Builder directly for well-scoped implementation and Fastlane for bounded work. Do not invoke all three by ritual; each subagent has an independent context and consumes additional credits.

Do not add permanent Oracle or Architect agents. Sol/Lead already owns both capabilities, and a renamed duplicate would add prompt and routing overhead without model diversity. For cross-cutting or hard-to-reverse work, use VS Code's built-in Plan agent, then request at most one fresh read-only Lead subagent to independently challenge assumptions, alternatives, failure modes, and verification.

## VS Code Setup

1. Use VS Code 1.128.0 or newer and enable all three GPT-5.6 models in **Chat: Manage Language Models**.
2. Open each model's picker submenu and select **XHIGH** for Sol when offered, and **HIGH** for Terra and Luna. VS Code remembers effort per model/session. `.agent.md` has no documented effort property, so adding `effort:` would be inert or invalid.
3. Trust the workspace. In **Configure Tools**, select all tools that agents may use. The agent files intentionally omit `tools`, which avoids a restrictive or stale allowlist and uses VS Code's dynamic defaults.
4. Keep nested subagents disabled unless a real divide-and-conquer task requires them. The normal topology is one-level Lead to Builder/Fastlane delegation.
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

## Headroom And Caveman

Do not add either to the always-loaded repository setup today.

Headroom 0.31 supports Copilot **CLI** wrapping and an MCP server, but its repository does not document transparent interception of native VS Code Copilot Chat. Its largest savings are for JSON, logs, and long tool-heavy sessions; its limitations page reports a 4.8% median reduction for short conversations and passes source code, grep output, and RAG contexts through. RTK already captures the highest-value terminal-output case here without another proxy, tool schema, cache, or retrieval layer.

For a measured experiment, pilot Headroom only in non-sensitive Copilot CLI sessions, disable telemetry, compare cost and accuracy against a holdout, and verify Windows credential handling. Keep it only if Agent Debug Logs show net savings after latency and MCP-schema overhead.

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