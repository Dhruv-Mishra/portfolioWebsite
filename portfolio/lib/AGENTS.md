# Agent Guide

Scope: shared utilities, server logic, integrations, command registries, retrieval, and tests.

## Boundaries

- Keep server-only code behind `server-only` imports or route-only call sites.
- Do not import Node-only modules into client components.
- Prefer typed, structured helpers for provider payloads, request parsing, and command/action routing.
- Keep LLM, embeddings, GitHub, and TTS behavior configurable through environment variables documented in package docs.

## Tests

- Existing tests live in `lib/__tests__` and run with Vitest.
- Add focused tests for retrieval, prompt assembly, command routing, auth, provider payloads, and parsing changes.
- Avoid snapshots unless explicitly requested.

## Validation

- Run `rtk vitest run` from the app directory for logic changes.
- Run `rtk lint` if imports, types, or route-connected code changed.