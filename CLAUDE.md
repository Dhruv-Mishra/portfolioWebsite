# Claude Code — Project Instructions

## Project Overview

This is **Dhruv's Sketchbook** — a Next.js 16 portfolio website with a creative "sketchbook" aesthetic, featuring an interactive terminal, AI chat, and project showcase.

**Tech Stack:**
- Next.js 16 (App Router, Turbopack, standalone output)
- React 19 with TypeScript 5 (strict mode)
- Tailwind CSS 4 (CSS custom properties for theming)
- Framer Motion 12 (animations)
- ESLint 9 (flat config)
- npm package manager

---

## Multi-Agent Workflow

This project includes a multi-agent workflow defined in `.github/agents/`. Each `.agent.md` file is a specialized agent with a defined role, persona, and responsibilities.

### Agents

| Agent | File | Role |
|---|---|---|
| Prompt Engineer | `.github/agents/prompt-engineer.agent.md` | Refines user prompts into actionable specs |
| Orchestrator | `.github/agents/orchestrator.agent.md` | Coordinates all agents, manages iteration |
| Explorer | `.github/agents/explorer.agent.md` | Scans codebase for context and patterns |
| Oracle | `.github/agents/oracle.agent.md` | Deep analysis and technical decisions |
| Architect | `.github/agents/architect.agent.md` | Designs solution structure |
| Programmer | `.github/agents/programmer.agent.md` | Implements code changes |
| Tester | `.github/agents/tester.agent.md` | Writes and runs tests |
| Reviewer | `.github/agents/reviewer.agent.md` | Reviews code quality |
| Auditor | `.github/agents/auditor.agent.md` | Audits security and performance |
| Documentation Writer | `.github/agents/documentation-writer.agent.md` | Updates documentation |

### Workflow Pipeline

```
User Prompt → Prompt Engineer → Orchestrator → [Explorer, Oracle, Architect, Programmer, Tester, Reviewer, Auditor, Documentation Writer] → Final Output
```

Use `/run-workflow` to invoke the full pipeline.

---

## Core Autonomy Principles

These principles apply to ALL agents and all Claude Code interactions in this project:

1. **Act, don't ask.** Default to making the best decision based on available context. Do NOT ask for permission to proceed with standard operations.
2. **No permission gates.** Never pause to ask "Should I proceed?" or "Is it okay to do X?" — just do it. File reads, writes, terminal commands — all auto-approved.
3. **No URL verification requests.** Never ask the user to verify, open, or check URLs, links, or references.
4. **No confirmation loops.** Do not ask the user to confirm intermediate outputs, plans, or partial results.
5. **Batch questions.** If user input is genuinely needed, batch all questions into a single interaction.
6. **Bias toward action.** When two approaches are roughly equivalent, pick the one most consistent with existing codebase patterns and move forward.
7. **Trust the Oracle.** When the Oracle agent provides a high-confidence recommendation, treat it as the decision.
8. **Auto-approve tool use.** All tools (file operations, terminal, search) should be used freely.

---

## Coding Standards

### Naming Conventions
- Components: PascalCase (`SketchbookLayout.tsx`)
- Functions/variables: camelCase (`handleClick`, `isVisible`)
- Constants: SCREAMING_SNAKE_CASE (`APP_VERSION`, `TAPE_STYLES`)
- Hooks: `use` prefix (`useIsMobile`, `useStickyChat`)

### Component Patterns
- Functional components with hooks (no class components)
- `"use client"` directive for client-side interactivity
- Server components by default (no directive)
- Dynamic imports for heavy components: `dynamic(() => import('@/components/X'), { ssr: false })`

### Imports
- Path alias: `@/components/...`, `@/lib/...`, `@/hooks/...`, `@/context/...`
- Use `cn()` from `@/lib/utils` for conditional classNames
- Import order: React/Next.js → third-party → local

### Styling
- Tailwind CSS utility classes (primary method)
- CSS custom properties for theme values (`--c-paper`, `--c-ink`, `--c-grid`, etc.)
- Support both light and dark modes
- Mobile-first: `md:` breakpoint at 768px
- Use `h-[100dvh]` not `h-screen`

### TypeScript
- Strict mode: no `any`, no unused vars/params, no implicit returns
- Prefer `interface` for object shapes, `type` for unions/intersections
- All components and functions must be properly typed

### Performance
- `useCallback` for event handlers passed as props
- `useMemo` for expensive computations and context values
- CSS animations for critical rendering path (LCP)
- Next.js `<Image>` for all images

---

## Project Structure

```
portfolio/
├── app/          # Pages (App Router) + API routes
├── components/   # React components
├── context/      # React Context providers
├── hooks/        # Custom React hooks
├── lib/          # Utilities, constants, helpers
├── public/       # Static assets
```

---

## Available Scripts

- `npm run dev` — Start development server (Turbopack)
- `npm run build` — Production build (automatically runs `prebuild` → `build:embeddings`)
- `npm run start` — Start production server
- `npm run lint` — Run ESLint
- `npm test` — Run the vitest suite
- `npm run build:embeddings` — Regenerate `lib/facts.embeddings.json` from `content/facts/**`. Runs automatically as a `prebuild` hook on `npm run build`.

---

## Environment Variables

Public (client-safe):
- `NEXT_PUBLIC_GA_ID` — Google Analytics ID
- `NEXT_PUBLIC_SITE_URL` — Site URL
- `NEXT_PUBLIC_ENABLE_ANALYTICS` — Analytics toggle
- `NEXT_PUBLIC_ENABLE_ERROR_TRACKING` — Error tracking toggle

Server-only (secrets):
- `LLM_API_KEY` — Primary LLM API key
- `LLM_BASE_URL` — Primary LLM base URL
- `LLM_MODEL` — Primary LLM model
- `LLM_FALLBACK_API_KEY` — Fallback LLM API key
- `LLM_FALLBACK_BASE_URL` — Fallback LLM base URL
- `LLM_FALLBACK_MODEL` — Fallback LLM model
<<<<<<< Updated upstream
- `EMBEDDINGS_API_KEY` — Optional: API key for the embeddings endpoint. Falls back to `LLM_API_KEY`. Required at build time unless `SKIP_EMBEDDINGS_BUILD=1` or `EMBEDDINGS_MODE=local` is set.
- `EMBEDDINGS_BASE_URL` — Optional: embeddings endpoint base URL. Falls back to `LLM_BASE_URL`; if neither resolves to an OpenAI-compatible embeddings provider, leave both unset so the script points at standard OpenAI.
- `EMBEDDINGS_MODEL` — Optional embeddings model id. Defaults to `text-embedding-3-small`.
- `EMBEDDINGS_MODE` — Set to `local` to generate deterministic hashed-n-gram embeddings offline (dev/CI only; lexical rather than semantic). Omit for real API embeddings.
- `SKIP_EMBEDDINGS_BUILD` — Set to `1` in CI to skip the prebuild embeddings step and reuse the committed `lib/facts.embeddings.json`.
=======
<<<<<<< Updated upstream
=======
- `EMBEDDINGS_API_KEY` — Optional: API key for the embeddings endpoint. Falls back to `LLM_API_KEY`. If neither is set AND `EMBEDDINGS_MODE=local` is not set, the build script auto-reuses the committed `lib/facts.embeddings.json` (this is the default for production deploys — no config needed).
- `EMBEDDINGS_BASE_URL` — Optional: embeddings endpoint base URL. Falls back to `LLM_BASE_URL`; if neither resolves to an OpenAI-compatible embeddings provider, leave both unset so the script points at standard OpenAI.
- `EMBEDDINGS_MODEL` — Optional embeddings model id. Defaults to `text-embedding-3-small`.
- `EMBEDDINGS_MODE` — Set to `local` to generate deterministic hashed-n-gram embeddings offline (dev/CI only; lexical rather than semantic). Omit for real API embeddings (or auto-reuse when no API key is present).
- `SKIP_EMBEDDINGS_BUILD` — Set to `1` to explicitly skip the prebuild embeddings step and reuse the committed `lib/facts.embeddings.json`. Usually unnecessary — the default behavior auto-reuses when no API key is configured.
>>>>>>> Stashed changes

## RAG / Chat Context

The chat system uses a hybrid retrieval pipeline:

1. **Fact corpus** lives in `portfolio/content/facts/**/*.md`. Each file has YAML frontmatter (`id`, `tags`, `priority`, `anchor`, optional `category` and `slug`) followed by a markdown body.
2. **Build-time embeddings** — `scripts/build-embeddings.ts` walks the corpus, calls the embeddings API, and writes `lib/facts.embeddings.json`. The file is committed and imported statically so Next.js bundles it.
3. **Runtime retrieval** — `lib/factRetrieval.server.ts` embeds the user query at request time, computes cosine similarity in memory, and returns anchor facts plus the top-K non-anchor facts. Gracefully degrades to priority-ordered anchors if the embeddings API fails or the bundle is missing.
4. **Conditional prompt assembly** — `lib/chatContext.server.ts` splits the system prompt into blocks (identity, style, grounding) plus conditional blocks (off-topic, UI action, terminal rules) emitted only when the latest user message warrants them.
<<<<<<< Updated upstream
=======
>>>>>>> Stashed changes
>>>>>>> Stashed changes
