# Dhruv's Sketchbook — [whoisdhruv.com](https://whoisdhruv.com)

A creative portfolio website with a hand-drawn sketchbook aesthetic — graph-paper light mode, chalkboard dark mode, an interactive terminal, an AI chat that actually knows things about me, a guestbook wall, a sticker album, and a few things you'll have to find on your own.

<img width="1600" height="793" alt="Image" src="https://github.com/user-attachments/assets/c9af02b4-147f-4066-b56c-ee98e093b642" />

> Psst: there's a terminal at the top of the page. Some commands are listed in `help`. Others are not. Try things that feel like they shouldn't work — the terminal knows more than it's letting on.

## Tech Stack

- **Framework:** Next.js 16.1.6 (App Router, Turbopack, standalone output) + React 19.2.3
- **Language:** TypeScript 5 (strict mode — no `any`, no unused params)
- **Styling:** Tailwind CSS 4 with CSS custom properties for theming
- **Animation:** Framer Motion 12
- **LLM:** OpenAI-compatible SDK with automatic primary → fallback provider routing
- **Testing:** Vitest 2
- **Lint:** ESLint 9 (flat config)

## Infrastructure

- **Multi-cloud deployment** across Azure, GCP, and Oracle Cloud VMs
- **Custom traffic manager** for request routing across instances
- **Cloudflare** for edge caching, CDN, and strict SSL
- **Nginx** reverse proxies on each VM — see `portfolio/nginx-cloudflare.conf` for the template
- **Parallel CI/CD** via GitHub Actions (matrix strategy deploys to all machines simultaneously)
- **systemd**-managed Node.js services with per-machine deploy scripts
- **Next.js standalone output** so each VM runs a minimal, self-contained server bundle

## Features

- **Sketchbook UI** — graph-paper light mode, chalkboard dark mode, custom pencil/chalk cursor, hand-drawn doodles scattered through the layout
- **Interactive Terminal** — persistent command history across navigation, tab-complete, aliases, and a growing set of commands (some of which you have to earn)
- **AI Chat** — streaming responses via Server-Sent Events, with automatic provider fallback and retrieval-augmented context from a local fact corpus
- **Guestbook** — sign the wall, leave a note; backed by a GitHub repo (one note per commit)
- **Sticker Album** — a collection of hidden badges. Some are easy, some are mean. Check `/stickers` to see what you've earned and what's still in the shrink-wrap
- **Project Showcase** — polaroid-style cards with tape effects, hover tilt, and hand-drawn accents
- **Resume** — embedded PDF viewer (desktop) / download card (mobile)
- **Command Palette** — `⌘K` / `Ctrl+K` to jump anywhere, toggle theme, copy email, open feedback, etc.
- **Keyboard shortcuts** — press `?` to see the full list
- **Theme toggle** — light ↔ dark, persisted across visits; auto-respects system preference on first load
- **Creative modes** — the site has a disco mode and a matrix mode. Both are real. Neither is reached from the navbar. Figure it out.
- **Secrets** — there are things in here you have to earn. Not every command is in `help`. Good luck.

## The Terminal

Start with `help`. The commands listed there are the public surface. The list below is the same, for convenience:

| Command | What it does |
|---|---|
| `help` | Lists the public commands |
| `about` | Who is Dhruv |
| `projects` | Navigate to the project gallery |
| `resume` / `cv` | Navigate to the resume page |
| `chat` | Navigate to the AI chat |
| `contact` | Ways to reach me |
| `socials` | List social links |
| `github` | Opens my GitHub in a new tab |
| `linkedin` | Opens my LinkedIn in a new tab |
| `skills` | View the tech stack + rankings |
| `ls` | List "files" in this portfolio |
| `cat [file]` | Read a file (try `cat about.md`) |
| `open [file]` | Open a file in its proper viewer |
| `whoami` | `visitor@dhruvs.portfolio` |
| `date` | Current date/time |
| `joke` | Fetches a programming joke |
| `guestbook` / `sign` | Sign the wall |
| `stickers` | Open the sticker album |
| `cheatsheet` | ... not for you. Yet. |
| `feedback` | Open the feedback form |
| `clear` | Clears the terminal |

Some commands will tell you they need more permissions than you currently have. Some won't appear in `help` at all until they're earned. The album at `/stickers` will tell you how close you are.

## Architecture Overview

```
portfolio/
├── app/              # App Router pages + API routes
│   ├── api/          # chat, feedback, guestbook, matrix-notes
│   └── ...           # about, chat, guestbook, projects, resume, stickers, ...
├── components/       # React components
│   ├── matrix/       # matrix-mode overlays and surfaces
│   ├── superuser/    # superuser reveal banner + toasts
│   └── ui/           # shared primitives
├── content/facts/    # Markdown fact corpus (RAG source)
│   ├── core/         # identity, site, stack, work-shell
│   ├── personal/
│   ├── projects/
│   ├── resume/
│   └── site/
├── context/          # React Context providers
├── hooks/            # useStickers, useSounds, useStickyChat, useIsMobile, ...
├── lib/              # commands, sudoCommands, factRetrieval, soundManager, guestbook, notes, ...
├── public/           # Static assets
└── scripts/          # build-embeddings.ts, deploy.sh, ...
```

### RAG / Chat context

The chat uses a hybrid retrieval pipeline:

1. **Fact corpus** lives in `portfolio/content/facts/**/*.md`. Each file is YAML frontmatter (`id`, `tags`, `priority`, `anchor`, ...) plus a markdown body.
2. **Build-time embeddings** — `scripts/build-embeddings.ts` walks the corpus, calls the embeddings API, and writes `lib/facts.embeddings.json` (committed; bundled statically by Next.js).
3. **Runtime retrieval** — `lib/factRetrieval.server.ts` embeds the user query at request time, computes cosine similarity in memory, and returns anchor facts plus the top-K non-anchor facts. Gracefully degrades to priority-ordered anchors if embeddings are unavailable.
4. **Conditional prompt assembly** — `lib/chatContext.server.ts` splits the system prompt into identity / style / grounding blocks plus conditional blocks (off-topic, UI-action, terminal rules) emitted only when the latest message warrants them.

### Guestbook & matrix notes

The guestbook wall (and its sibling notes wall, which is a whole separate thing you'll find later) is backed by a GitHub repo. Each submission becomes a commit; the wall reads the repo contents via the GitHub API. No database, no user accounts — just Markdown files in a repo.

### Sticker / badge state

Unlocked stickers, earned timestamps, session flags (disco / matrix), visited routes, and a few other things live in `localStorage` under the key `dhruv-stickers`, versioned and migrated on load (`hooks/useStickers.ts`). All reveal logic is client-side; the server never knows how many stickers you have.

## Getting Started

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build (auto-runs `prebuild` → `build:embeddings`) |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run build:embeddings` | Regenerate `lib/facts.embeddings.json` from `content/facts/**` |

The top-level `package.json` at the repo root re-exports `dev` / `build` / `start` / `lint` as pass-throughs into `portfolio/`, so you can run them from either directory.

## Environment Variables

Everything server-side reads from `process.env`. No `.env.local.example` is checked in — use the list below as your starting point.

### Public (client-safe, exposed to the browser)

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL |
| `NEXT_PUBLIC_GA_ID` | Google Analytics measurement ID |
| `NEXT_PUBLIC_ENABLE_ANALYTICS` | Feature flag for analytics |
| `NEXT_PUBLIC_ENABLE_ERROR_TRACKING` | Feature flag for error tracking |

### LLM (server-only)

| Var | Purpose |
|---|---|
| `LLM_API_KEY` | Primary LLM API key |
| `LLM_BASE_URL` | Primary LLM base URL |
| `LLM_MODEL` | Primary LLM model id |
| `LLM_ENABLE_FALLBACK_MODEL` | Set to `true` to route through the fallback provider when the primary fails |
| `LLM_FALLBACK_API_KEY` | Fallback provider key |
| `LLM_FALLBACK_BASE_URL` | Fallback base URL |
| `LLM_FALLBACK_MODEL` | Fallback chat model id |
| `LLM_SUGGESTIONS_MODEL` | Optional: model used for chat suggestions (falls back to `LLM_MODEL`) |
| `LLM_FALLBACK_SUGGESTIONS_MODEL` | Optional: fallback suggestions model |
| `CHAT_HISTORY_SIGNING_SECRET` | HMAC secret for chat-history tokens (falls back to `LLM_API_KEY` if unset) |

### Embeddings (build-time + runtime)

| Var | Purpose |
|---|---|
| `EMBEDDINGS_API_KEY` | Optional: embeddings API key. Falls back to `LLM_API_KEY`. If neither is set and `EMBEDDINGS_MODE=local` is also unset, the build auto-reuses the committed `lib/facts.embeddings.json` |
| `EMBEDDINGS_BASE_URL` | Optional: embeddings endpoint. Falls back to `LLM_BASE_URL`, else standard OpenAI |
| `EMBEDDINGS_MODEL` | Optional: defaults to `text-embedding-3-small` |
| `EMBEDDINGS_MODE` | Set to `local` for deterministic hashed-n-gram embeddings (dev/CI only — lexical, not semantic) |
| `SKIP_EMBEDDINGS_BUILD` | Set to `1` to skip the prebuild step and reuse the committed bundle |

### GitHub-backed content (guestbook, matrix notes, feedback)

| Var | Purpose |
|---|---|
| `GITHUB_GUESTBOOK_TOKEN` / `GITHUB_GUESTBOOK_REPO` | PAT + `owner/repo` for the guestbook wall |
| `GITHUB_FEEDBACK_TOKEN` / `GITHUB_FEEDBACK_REPO` | PAT + `owner/repo` for the feedback form (also used as fallback for the guestbook) |
| `GITHUB_MATRIX_NOTES_TOKEN` / `GITHUB_MATRIX_NOTES_REPO` | PAT + `owner/repo` for the secondary notes wall (falls back to guestbook, then feedback) |

### Misc

| Var | Purpose |
|---|---|
| `ALLOWED_ORIGINS` | Comma-separated list of extra origins allowed to call the API routes |
| `LOG_RAW` | Set to `true` in dev to log raw LLM payloads |

## Deployment

Production is Next.js `output: 'standalone'`, sitting behind Nginx (see `portfolio/nginx-cloudflare.conf` for the full template, including rate-limit zones and Cloudflare real-IP handling) with Cloudflare as the edge. Deploys run from GitHub Actions using a matrix strategy that builds once and pushes to every VM in parallel, then each VM restarts its systemd unit. `portfolio/scripts/deploy.sh` is the per-machine deploy entry point.

## Agent Workflow

This repo ships a multi-agent workflow under `.github/agents/` — a Prompt Engineer, Orchestrator, Explorer, Oracle, Architect, Programmer, Tester, Reviewer, Auditor, and Documentation Writer, each defined as an `*.agent.md` with its role and responsibilities. The `/run-workflow` slash command (see `CLAUDE.md`) kicks off the full pipeline end-to-end. See `CLAUDE.md` for the full autonomy principles, coding standards, and pipeline diagram.

## A note on secrets

This site has a few hidden things. The README isn't going to spoil them — half the fun is poking around. A couple of breadcrumbs, in order of difficulty:

- Not every command is in `help`.
- Some commands need permissions you don't have yet.
- The sticker album tells you how close you are, without telling you how.
- And if you make it all the way through, you might find a wall that only opens for people who've already left.

Have fun.
