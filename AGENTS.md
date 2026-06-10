# Agent Guide

Scope: the whole repository.

## Orientation

- The production app lives in [portfolio](portfolio). The workspace root only wraps common npm scripts.
- Do not add a root `package-lock.json`; the real lockfile is [portfolio/package-lock.json](portfolio/package-lock.json).
- Read the nearest directory-level `AGENTS.md` before editing a file. More specific files override this one.
- Keep public docs concise. Put operational detail in [portfolio/README.md](portfolio/README.md) or a focused docs file.

## Commands

- `npm run dev` starts the app from the root.
- `npm run build` builds the app from the root.
- `npm run lint` runs ESLint from the root.
- `npm --prefix portfolio run test` runs the Vitest suite.

## Deployment Facts

- Staging uses `deployed/staging`, Docker image deploys, `staging.whoisdhruv.com`, service `portfolio-staging`, and port `3010`.
- Production lives at `whoisdhruv.com`. The production source branch is `master`; the current checked-in production deploy workflow promotes from `deployed/production` after the production environment gate.
- Runtime is Linux VMs behind Cloudflare and Nginx, running Next.js standalone output. Docker is active in staging and available for production migration.

## Cleanup Rules

- Safe cleanup targets are generated logs, temp screenshots, build transcripts, and local machine state.
- Do not remove runtime markdown routes, `portfolio/content/facts/**/*.md`, or `portfolio/lib/facts.embeddings.json` as generic docs cleanup.
- Store curated README screenshots in [docs/screenshots](docs/screenshots), not under `portfolio/tmp`.