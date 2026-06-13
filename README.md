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

- Astro Node with React 19 route islands
- TypeScript, Tailwind CSS 4, Framer Motion 12
- Groq-first chat runtime with OpenAI-compatible fallback support
- GitHub-backed guestbook, feedback, and notes workflows
- Astro check plus the retained Next/Vitest comparison suite
- Linux VMs behind Cloudflare and Nginx; Docker image deploys for staging and production

## Run Locally

From the repo root:

```bash
npm install
npm run dev
```

The migrated Astro app lives in [portfolio-astro](portfolio-astro). The root `package.json` proxies `dev`, `build`, `start`, and `lint` there. The previous Next app remains in [portfolio](portfolio) for comparison through the root `next:*` scripts.

## Useful Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Astro dev server |
| `npm run build` | Build the Astro Node app |
| `npm run start` | Start the built Astro server |
| `npm run lint` | Run Astro check |
| `npm run next:test` | Run the retained Next/Vitest comparison suite |

## Deployment

- `dev/lkg` is the primary development branch for reviewed changes.
- `deployed/staging` is the staging deployment branch; direct pushes deploy to [staging.whoisdhruv.com](https://staging.whoisdhruv.com).
- `deployed/production` is the production deployment branch; direct pushes deploy to [whoisdhruv.com](https://whoisdhruv.com) after the production environment gate.
- Manual promotion workflows move `dev/lkg` to `deployed/staging`, then `deployed/staging` to `deployed/production`.
- Cloudflare sits at the edge, with Nginx and the Astro Node server on the VM origin. Local TTS remains VM-backed for this phase.

## For Agents

Start with [AGENTS.md](AGENTS.md), then read the nearest directory-level `AGENTS.md` before editing files in that area. Keep runtime markdown routes and the fact corpus unless the task explicitly changes public/RAG content.
