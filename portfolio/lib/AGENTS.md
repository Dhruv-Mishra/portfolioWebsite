# Agent Guide

Scope: shared utilities, server logic, integrations, command registries, retrieval, and tests.

## Boundaries

- Keep server-only code behind `server-only` imports or route-only call sites.
- Do not import Node-only modules into client components.
- Prefer typed, structured helpers for provider payloads, request parsing, and command/action routing.
- Keep LLM, embeddings, GitHub, and TTS behavior configurable through environment variables documented in package docs.

## Shared Building Blocks

- `localPreference.ts`: `LocalPreference<T>` + `usePreference` for any single persisted browser setting. Object-shaped stores (admin prefs, stickers) keep their own modules.
- `boundedJson.server.ts`: API routes read bodies with `readJsonObjectOrError`; return the `Response` it yields on bad input.
- `replyLength.ts`: the one place that maps a question to a reply length hint and local-model token cap.
- `chatPromptBlocks.ts`: persona rules shared by server and on-device chat. Keep them short and imperative; small local models follow terse rules better than prose.

## Tests

- Tests live in `lib/__tests__` and run with Vitest in a Node environment.
- Test behavior through public functions, routes, or stores. Do not assert on source text, CSS, or workflow YAML.
- Prefer table-driven `it.each` cases over near-duplicate tests; delete tests for code you remove.
- Avoid snapshots unless explicitly requested.

## Validation

- Run `npm test` from the app directory for logic changes.
- Run `npm run lint` if imports, types, or route-connected code changed.