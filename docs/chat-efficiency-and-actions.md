# Chat Efficiency and Website Actions

Decision date: 2026-07-18

## Decision

Do not add Headroom to the live website request path yet. Keep the chat provider and model agnostic through the existing OpenAI-compatible message boundary, deterministic server routing, and signed browser actions.

Headroom remains a candidate for a measured data-only trial when chat context becomes materially larger. The stable system prompt must never pass through lossy compression.

## Why Headroom Is Gated Off

- Headroom is strongest on large JSON, logs, tool results, code, and long retrieval payloads. This chat sends short conversation turns and at most six retrieved facts.
- Headroom's published short-conversation median saving is about 4.8%, while a proxy and optional local model add another process, cold-start risk, and request latency.
- The chat already preserves a stable prompt prefix for provider caching and now bounds history to eight messages and 3,200 characters.
- Current releases are not aligned across runtimes: the researched Python/GitHub release is `0.32.0`, while npm reports `headroom-ai@0.22.4`. The TypeScript SDK also requires a Headroom proxy rather than embedding the Python compression pipeline in Next.js.
- System-message compression behavior has differed between documentation and source defaults. Identity, grounding, prompt-injection resistance, action rules, and Matrix puzzle constraints are not acceptable lossy-compression targets.

References:

- https://headroom-docs.vercel.app/docs
- https://github.com/headroomlabs-ai/headroom
- https://github.com/headroomlabs-ai/headroom/releases/tag/v0.32.0
- https://www.npmjs.com/package/headroom-ai

## Implemented Architecture

The request path has three bounded tiers:

1. Deterministic intent routing handles approved website actions without an LLM call.
2. Deterministic project lookup handles known project explanations without an LLM call.
3. The configured provider handles conversational replies using plain role/content messages.

The provider never emits executable JSON and receives no provider-specific tool schema. Website actions use one provider-neutral `ActionExecution` contract, are validated and signed on the server, and execute in a fixed client order.

Approved capabilities now include:

- Navigate to home, about, projects, resume, chat, guestbook, stickers, or settings.
- Open approved profiles, contact links, resume, project repositories, or the Jarvis demo.
- Open a project modal or feedback note, or start native voice mode.
- Select light, dark, toggle, disco, or disco-off modes.
- Chain up to three compatible effects from explicit natural-language clauses.

Gates:

- Only allowlisted paths, themes, project slugs, and exact URLs are accepted.
- At most two unique external URLs and three total effects are allowed.
- At most one in-page action (project modal, feedback note, voice mode, field fill, or guestbook submission) may run per action bundle.
- Navigation cannot be combined with a transient surface.
- Negated, explanatory, ambiguous, unresolved, conflicting, or oversized chains fall back to normal conversation.
- Replayed assistant actions require an HMAC signature. Invalid non-empty actions fail closed.
- Client-only suggestion shortcuts remain intentionally unsigned and are excluded from trusted server history; typed natural-language actions use the signed server path.
- Hidden admin and Matrix surfaces are not exposed as chat actions.

A public MCP server is intentionally out of scope. These operations are local browser effects, and the signed action contract provides the same model-friendly capability without exposing a new network execution surface.

## Token Budget

Verified source budgets after this change:

- Stable identity/style/grounding/TTS prompt: 634 characters, down from about 2,163.
- Suggestions system prompt: 246 characters, down from about 2,698.
- Main completion ceiling: 220 tokens, down from 400.
- Suggestions completion ceiling: 48 tokens, down from 80.
- Provider history: newest contiguous eight messages within 3,200 content characters.
- Suggestions history: newest four messages, each capped at 300 characters.

Tests assert prompt size ceilings and required safety semantics so future edits cannot recover tokens by silently dropping guardrails.

## Future Headroom Trial

Reconsider Headroom only when representative production traces show a median dynamic input above 4,000 tokens or tool/RAG payloads dominate request tokens.

Trial plan:

1. Pin one Headroom release and deployment image. Disable telemetry and full-message logging.
2. Run audit or simulation against redacted fixtures first. Do not route live user traffic.
3. Exclude all system messages and action schemas. Compress only delimited retrieval data or future tool results.
4. Start with lossless transforms. Add lossy compression only with durable CCR storage and a tested retrieval path.
5. Gate the adapter with a feature flag, minimum token threshold, hard timeout, and fail-open passthrough.
6. Use a 10% staging holdout and compare input tokens, provider cache hits, time to first token, total latency, factual quality, and action success.

Promotion criteria:

- At least 20% median input-token reduction on eligible requests.
- No statistically meaningful factual or action-quality regression.
- No prompt-cache regression on the stable prefix.
- No more than 100 ms added p50 latency and 250 ms added p95 latency.
- Zero compressor-caused request failures; all faults pass through unchanged.

## Staging Rollout

1. Merge the reviewed feature PR into `dev/lkg`.
2. Run `Promote dev/lkg to Staging`; it fast-forwards `deployed/staging` and starts the staging deployment workflow.
3. Smoke-test concise factual replies, explanation-versus-action gating, each new page action, voice mode on desktop/mobile, valid chains, rejected conflicts, fallback behavior, and suggestions.
4. Compare provider input/output usage and latency against the previous staging deployment.
5. Roll back through the repository workflow if factual quality, action safety, or latency regresses.