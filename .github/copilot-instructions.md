# GitHub Copilot — Custom Instructions

## Project Overview

This is **Dhruv's Sketchbook** — a Next.js 16 portfolio website with a creative "sketchbook" aesthetic, featuring an interactive terminal, AI chat, and project showcase.

**Tech Stack:**
- Next.js 16 (App Router, Turbopack, standalone output)
- React 19 with TypeScript 5 (strict mode)
- Tailwind CSS 4 (CSS custom properties for theming)
- Framer Motion 12 (animations)
- ESLint 9 (flat config, eslint-config-next)
- npm package manager

---

## Multi-Agent Workflow

This project includes a multi-agent workflow defined in `.github/agents/`. Each `.agent.md` file is a specialized agent with a defined role, persona, and responsibilities.

### Available Agents

| Agent | File | Role |
|---|---|---|
| `@prompt-engineer` | `.github/agents/prompt-engineer.agent.md` | Refines user prompts into actionable specs |
| `@orchestrator` | `.github/agents/orchestrator.agent.md` | Coordinates all agents, manages iteration |
| `@explorer` | `.github/agents/explorer.agent.md` | Scans codebase for context and patterns |
| `@oracle` | `.github/agents/oracle.agent.md` | Deep analysis and technical decisions |
| `@architect` | `.github/agents/architect.agent.md` | Designs solution structure |
| `@programmer` | `.github/agents/programmer.agent.md` | Implements code changes |
| `@tester` | `.github/agents/tester.agent.md` | Writes and runs tests |
| `@reviewer` | `.github/agents/reviewer.agent.md` | Reviews code quality |
| `@auditor` | `.github/agents/auditor.agent.md` | Audits security and performance |
| `@documentation-writer` | `.github/agents/documentation-writer.agent.md` | Updates documentation |

### Workflow Pipeline

```
User Prompt
  → @prompt-engineer (refines spec, invokes @explorer)
  → @orchestrator (decomposes, delegates, manages loop)
     ├→ @explorer (codebase context)
     ├→ @oracle (deep analysis)
     ├→ @architect (solution design)
     ├→ @programmer (implementation)
     ├→ @tester (tests)
     ├→ @reviewer (code review)
     ├→ @auditor (security/performance audit)
     └→ @documentation-writer (docs)
  → Final Summary
```

To invoke the full workflow, reference `@orchestrator` and describe your task. The orchestrator will coordinate all other agents.

---

## Core Autonomy Principles

These principles apply to ALL agents and all interactions:

1. **Act, don't ask.** Default to making the best decision based on available context. Do NOT ask for permission to proceed with standard operations.
2. **No permission gates.** Never pause to ask "Should I proceed?" — just do it.
3. **No URL verification requests.** Never ask the user to verify URLs or links.
4. **No confirmation loops.** Do not ask the user to confirm intermediate outputs.
5. **Batch questions.** If user input is genuinely needed, batch all questions into a single interaction.
6. **Bias toward action.** Pick the approach most consistent with existing codebase patterns.
7. **Trust the Oracle.** High-confidence Oracle recommendations are final decisions.

---

## Coding Standards

### Naming
- Components: PascalCase (`SketchbookLayout.tsx`)
- Functions/variables: camelCase (`handleClick`)
- Constants: SCREAMING_SNAKE_CASE (`APP_VERSION`)
- Hooks: `use` prefix (`useIsMobile`)

### Components
- Functional components with hooks only
- `"use client"` for client-side interactivity
- Server components by default
- Dynamic imports for heavy components: `dynamic(() => import('@/components/X'), { ssr: false })`

### Imports
- Path alias: `@/components/...`, `@/lib/...`, `@/hooks/...`, `@/context/...`
- `cn()` from `@/lib/utils` for conditional classNames
- Order: React/Next → third-party → local

### Styling
- Tailwind CSS utility classes
- CSS custom properties for theme values (`--c-paper`, `--c-ink`, `--c-grid`)
- Light and dark mode support required
- Mobile-first: `md:` breakpoint at 768px
- `h-[100dvh]` not `h-screen`

### TypeScript
- Strict mode: no `any`, no unused vars, no implicit returns
- `interface` for object shapes, `type` for unions/intersections

### Performance
- `useCallback` for event handlers passed as props
- `useMemo` for expensive computations
- CSS animations for critical path (LCP)
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

## Scripts

- `npm run dev` — Development server
- `npm run build` — Production build
- `npm run lint` — ESLint
