# Dhruv's Sketchbook

The codebase for [whoisdhruv.com](https://whoisdhruv.com): a sketchbook-style portfolio with an interactive terminal, grounded AI chat, project pages, resume content, stickers, and a public guestbook.

- Production: [whoisdhruv.com](https://whoisdhruv.com)
- Staging: [staging.whoisdhruv.com](https://staging.whoisdhruv.com)

## Screenshots

| Home | Projects |
|---|---|
| ![Home page with terminal](docs/screenshots/home-desktop.png) | ![Projects page](docs/screenshots/projects-desktop.png) |

| Chat |
|---|
| ![Mobile chat page](docs/screenshots/chat-mobile.png) |

## What Ships

- Sketchbook UI with light and dark themes, motion, responsive layouts, and custom interaction details.
- Terminal-driven navigation with route commands and file-style content.
- AI chat grounded by a local fact corpus and build-time embeddings.
- Public pages for about, projects, resume, chat, guestbook, and stickers.
- Machine-readable routes for AI crawlers and markdown consumers.

Some routes and behaviors stay out of the README so the site keeps its discovery layer.

## Stack

- Next.js 16 App Router with standalone output
- React 19, TypeScript 5, Tailwind CSS 4, Framer Motion 12
- Groq-first chat runtime with OpenAI-compatible fallback support
- GitHub-backed guestbook, feedback, and notes workflows
- ESLint 9 and Vitest 4
- Linux VMs behind Cloudflare and Nginx; Docker is active in staging and available for production migration

## Run Locally

From the repo root:

```bash
npm install
npm run dev
```

The app lives in [portfolio](portfolio). The root `package.json` proxies `dev`, `build`, `start`, and `lint`; run tests with `npm --prefix portfolio run test`.

## Useful Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Build the production app |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm --prefix portfolio run test` | Run the Vitest suite |

## Deployment

- Staging deploys from `deployed/staging` to [staging.whoisdhruv.com](https://staging.whoisdhruv.com) using Docker image deploys on Linux VMs.
- Production lives at [whoisdhruv.com](https://whoisdhruv.com). The production source branch is `master`; the checked-in GitHub Actions deploy workflow currently promotes from `deployed/production` after the production environment gate.
- Cloudflare sits at the edge, with Nginx and the Next.js standalone server on the VM origin.

## For Agents

Start with [AGENTS.md](AGENTS.md), then read the nearest directory-level `AGENTS.md` before editing files in that area. Keep runtime markdown routes and the fact corpus unless the task explicitly changes public/RAG content.
