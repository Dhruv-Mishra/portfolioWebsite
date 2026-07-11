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
- Optional custom Pocket TTS server voice with device-speech fallback.
- Public pages for about, projects, resume, chat, guestbook, and stickers.
- Machine-readable routes for AI crawlers and markdown consumers.

Some routes and behaviors stay out of the README so the site keeps its discovery layer.

## Stack

- Next.js 16 App Router with standalone output
- React 19, TypeScript 5, Tailwind CSS 4, Framer Motion 12
- Groq-first chat runtime with OpenAI-compatible fallback support
- GitHub-backed guestbook, feedback, and notes workflows
- ESLint 9 and Vitest 4
- Linux VMs behind Cloudflare and Nginx; Docker image deploys for staging and production

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

- `dev/lkg` is the primary development branch for reviewed changes.
- `deployed/staging` is the staging deployment branch; direct pushes deploy to [staging.whoisdhruv.com](https://staging.whoisdhruv.com).
- `deployed/production` is the production deployment branch; direct pushes deploy to [whoisdhruv.com](https://whoisdhruv.com) after the production environment gate.
- Manual promotion workflows move `dev/lkg` to `deployed/staging`, then `deployed/staging` to `deployed/production`.
- Staging and production runtime signing secrets are stored as distinct repository-level Actions secrets and synchronized to every VM during deployment. Complete the one-time setup in [VMChangesRequired.md](VMChangesRequired.md).
- Pocket TTS deployments also require repository-level `STAGING_HF_TOKEN` and `PRODUCTION_HF_TOKEN` read-token secrets; detailed setup and voice-consent requirements live in [portfolio/README.md](portfolio/README.md).
- Cloudflare sits at the edge, with Nginx and the Next.js standalone server on the VM origin.

## For Agents

Start with [AGENTS.md](AGENTS.md), then read the nearest directory-level `AGENTS.md` before editing files in that area. Keep runtime markdown routes and the fact corpus unless the task explicitly changes public/RAG content.
