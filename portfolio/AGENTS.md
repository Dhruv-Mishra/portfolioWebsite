# Agent Guide

Scope: the Next.js application under this directory.

## App Rules

- Next.js 16 App Router, React 19, TypeScript 6 strict mode, Tailwind CSS 4, Framer Motion 14 (`LazyMotion` + `m`), Vitest 5.
- Server components by default. Add `"use client"` only for browser state, effects, events, or client-only libraries.
- Use `@/*` imports and `cn()` from `@/lib/utils` for conditional class names.
- Preserve light/dark theme support and mobile behavior. Use `h-[100dvh]` for viewport-height UI.
- Look-and-feel values come from tokens: TS values from `lib/designTokens.ts`, Tailwind utilities from the `@theme` block in `app/globals.css`, theme-dependent values from CSS custom properties. Do not add raw hex, rgba, z-index, or font-stack literals to components.
- `dark:` utilities follow the site theme (`.dark` on `<html>` via next-themes), not the OS setting.

## Commands

- Use the package scripts: `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:watch`.

## Runtime Content

- `content/facts/**/*.md` powers chat retrieval and embeddings.
- `app/*.md` route directories serve public markdown routes.
- `lib/facts.embeddings.json` is committed fallback data, not generated bloat to delete casually.

## Validation

- Run `npm run lint` for app code changes.
- Run `npm test` for logic, API, retrieval, command, or agent/test guidance changes.
- Use `$env:SKIP_EMBEDDINGS_BUILD='1'; npm run build` when validating deploy builds without embedding credentials on PowerShell.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
