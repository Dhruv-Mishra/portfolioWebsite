# Agent Guide

Scope: App Router pages, layouts, metadata, and API routes.

## Routes

- Keep server components as the default for pages and layouts.
- Markdown route directories such as `about.md`, `projects.md`, and `llms.txt` variants are public runtime surfaces.
- Update sitemap, metadata, and machine-readable routes together when public URL behavior changes.

## API Routes

- Keep secrets server-only. Never expose provider keys or GitHub tokens to client components.
- Preserve origin, rate-limit, and validation behavior around chat, guestbook, feedback, notes, and TTS endpoints.
- Prefer structured request parsing and typed response helpers over ad hoc string handling.

## Validation

- Run `npm run lint` after route changes.
- Run targeted Vitest tests under `lib/__tests__` when route behavior depends on shared server logic.