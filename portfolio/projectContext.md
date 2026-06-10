# Project Context: Dhruv's Sketchbook

This is the working context for agents editing the app in this directory. Keep it current and short; use the nearest `AGENTS.md` for directory-specific rules.

## Product Shape

Dhruv's Sketchbook is a Next.js portfolio that feels like a notebook/desk surface rather than a generic SaaS page. The main surfaces are home, about, projects, resume, chat, guestbook, stickers, and machine-readable markdown routes.

Core interaction ideas:

- A sketchbook layout with paper/grid styling, light and dark themes, motion, custom cursor behavior, and responsive mobile treatment.
- A terminal as a power-user navigation layer and content surface.
- A grounded chat experience backed by local facts and embeddings.
- GitHub-backed guestbook, feedback, and notes flows.

## Current Stack

- Next.js 16 App Router with standalone output.
- React 19, TypeScript 5 strict mode, Tailwind CSS 4, Framer Motion 12.
- ESLint 9 and Vitest 4.
- Groq-first LLM runtime with OpenAI-compatible fallback providers.
- Linux VMs behind Cloudflare and Nginx. Staging uses Docker images; production currently has image/artifact support and may move further toward Docker.

## Runtime Content

Do not treat these as disposable docs:

- `content/facts/**/*.md` feeds chat retrieval and build-time embeddings.
- `app/*.md` route directories serve public markdown content such as `about.md`, `projects.md`, and `llms.txt` variants.
- `lib/facts.embeddings.json` is committed so deploys can reuse embeddings when no API key is configured.

## Deployment Summary

- Staging: `deployed/staging`, `staging.whoisdhruv.com`, Docker image deploys, `portfolio-staging`, port `3010`.
- Production: `whoisdhruv.com`; the production source branch is `master`, while the checked-in production GitHub Actions deploy workflow is guarded on `deployed/production` after the production environment approval.
- Cloudflare handles the edge. Nginx and the Next.js standalone server run on the VM origin.

## Editing Rules

- Server components by default; add `"use client"` only for browser state, effects, events, or client-only libraries.
- Use `@/*` imports, `cn()` for conditional class names, and the local CSS variable theme system.
- Preserve light/dark mode and mobile behavior for UI changes. Prefer `h-[100dvh]` for viewport-height surfaces.
- Keep hidden routes, unlock conditions, and private behavior out of public docs.
- Run `npm run lint` and `npm --prefix portfolio run test` when changes touch app code, runtime logic, or agent/test guidance.
