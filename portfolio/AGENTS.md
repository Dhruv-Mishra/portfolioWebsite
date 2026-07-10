# Agent Guide

Scope: the Next.js application under this directory.

## App Rules

- Next.js 16 App Router, React 19, TypeScript strict mode, Tailwind CSS 4, Framer Motion 12.
- Server components by default. Add `"use client"` only for browser state, effects, events, or client-only libraries.
- Use `@/*` imports and `cn()` from `@/lib/utils` for conditional class names.
- Preserve light/dark theme support and mobile behavior. Use `h-[100dvh]` for viewport-height UI.

## Commands

- `rtk npm run dev`
- `rtk npm run build`
- `rtk lint`
- `rtk tsc --noEmit --pretty false`
- `rtk vitest run`
- `rtk npm run test:watch`

## Runtime Content

- `content/facts/**/*.md` powers chat retrieval and embeddings.
- `app/*.md` route directories serve public markdown routes.
- `lib/facts.embeddings.json` is committed fallback data, not generated bloat to delete casually.

## Validation

- Run `rtk lint` for app code changes.
- Run `rtk vitest run` for logic, API, retrieval, command, or agent/test guidance changes.
- Use `$env:SKIP_EMBEDDINGS_BUILD='1'; rtk npm run build` when validating deploy builds without embedding credentials on PowerShell.