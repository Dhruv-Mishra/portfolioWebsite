# Dhruv's Sketchbook

The codebase for [whoisdhruv.com](https://whoisdhruv.com): a sketchbook-style portfolio built with Next.js, with an interactive terminal, grounded AI chat, project and resume pages, a public guestbook, sticker progress, and a few intentionally undisclosed extras.

## What Ships

- Hand-drawn UI with light and dark themes, custom cursor, motion, and responsive layouts.
- Interactive terminal with route commands, file-style content, shortcuts, and unlockable behavior.
- AI chat backed by a local fact corpus plus build-time embeddings.
- Public pages for about, projects, resume, chat, guestbook, and stickers.
- Machine-readable surfaces for AI crawlers and markdown consumers: `llms.txt`, `llms-full.txt`, `index.md`, `about.md`, `projects.md`, and `resume.md`.

Some routes and behaviors are intentionally left out of the README to preserve the discovery part of the site.

## Stack

- Next.js 16 App Router with standalone output
- React 19 and TypeScript 5
- Tailwind CSS 4 and Framer Motion 12
- Groq-first chat runtime with OpenAI-compatible fallback support
- GitHub-backed guestbook, feedback, and notes workflows
- ESLint 9 and Vitest 4

## Project Layout

```text
portfolio/
├── app/              # routes, metadata, and API handlers
├── components/       # UI, terminal, chat, guestbook, stickers, layout
├── content/facts/    # markdown fact corpus used by chat retrieval
├── context/          # React providers
├── hooks/            # client hooks for sound, stickers, chat, mobile, etc.
├── lib/              # command registry, retrieval, integrations, utilities
├── public/           # static assets
└── scripts/          # embeddings build and deployment helpers
```

## Local Development

From the repo root:

```bash
npm install
npm run dev
```

The root `package.json` proxies `dev`, `build`, `start`, and `lint` into `portfolio/`, so you can work from either directory.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server from the repo root |
| `npm run build` | Production build from the repo root |
| `npm run start` | Start the production server from the repo root |
| `npm run lint` | Run ESLint from the repo root |
| `npm --prefix portfolio run test` | Run the Vitest suite |
| `npm --prefix portfolio run test:watch` | Run Vitest in watch mode |
| `npm --prefix portfolio run build:embeddings` | Regenerate `lib/facts.embeddings.json` |

## Environment

Only configure what you need for the features you want to run.

| Group | Variables |
|---|---|
| Public site config | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_GA_ID` |
| Chat provider | `GROQ_API_KEY`, `GROQ_MODEL` |
| OpenAI-compatible fallback | `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_ENABLE_FALLBACK_MODEL`, `LLM_FALLBACK_API_KEY`, `LLM_FALLBACK_BASE_URL`, `LLM_FALLBACK_MODEL` |
| Suggestions models | `LLM_SUGGESTIONS_MODEL`, `LLM_FALLBACK_SUGGESTIONS_MODEL` |
| Embeddings | `EMBEDDINGS_API_KEY`, `EMBEDDINGS_BASE_URL`, `EMBEDDINGS_MODEL`, `EMBEDDINGS_MODE`, `SKIP_EMBEDDINGS_BUILD` |
| GitHub-backed content | `GITHUB_GUESTBOOK_TOKEN`, `GITHUB_GUESTBOOK_REPO`, `GITHUB_FEEDBACK_TOKEN`, `GITHUB_FEEDBACK_REPO`, `GITHUB_MATRIX_NOTES_TOKEN`, `GITHUB_MATRIX_NOTES_REPO` |
| Access and API controls | `ADMIN_UNLOCK_SECRET`, `ALLOWED_ORIGINS`, `CHAT_HISTORY_SIGNING_SECRET`, `LOG_RAW` |

## Deployment

Production uses Next.js standalone output behind Cloudflare and Nginx. GitHub Actions builds the artifact once, then deploys it in parallel to the configured VMs; `portfolio/scripts/deploy.sh` is the per-machine entry point used by that flow.

## Notes

- Guestbook submissions are moderated through GitHub Issues, not a database.
- The chat API returns JSON responses and uses retrieval over the local fact corpus for grounding.
- `npm run build` in `portfolio/` runs `prebuild`, which regenerates embeddings unless explicitly skipped.
