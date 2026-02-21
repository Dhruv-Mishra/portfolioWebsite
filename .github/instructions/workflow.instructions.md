# Multi-Agent Workflow Instructions

This document defines the workspace-level instructions for the multi-agent development workflow used in this project.

---

## Workflow Overview

This project uses a multi-agent pipeline where specialized agents collaborate to deliver high-quality code changes autonomously. The workflow is designed to run end-to-end with minimal user interruption.

### Pipeline Stages

1. **Prompt Refinement** (`@prompt-engineer` + `@explorer`)
   - Analyze user prompt for ambiguity
   - Gather codebase context via Explorer
   - Auto-resolve gaps using codebase patterns
   - Produce a structured specification with acceptance criteria

2. **Orchestration** (`@orchestrator`)
   - Decompose specification into discrete tasks
   - Identify dependencies and parallelizable work
   - Delegate tasks to specialized agents
   - Manage the iteration loop until completion

3. **Analysis** (`@oracle`)
   - Perform deep analysis on complex technical decisions
   - Provide recommendations with confidence levels
   - High-confidence recommendations are treated as final decisions

4. **Design** (`@architect`)
   - Translate requirements into a technical design document
   - Define file-by-file change plan, interfaces, data flow
   - Ensure consistency with existing architecture

5. **Implementation** (`@programmer`)
   - Write production-quality code following the design
   - Follow all codebase conventions and standards
   - Run linting after implementation

6. **Testing** (`@tester`)
   - Write unit, integration, and edge-case tests
   - Run tests and report results
   - Report failures for programmer to address

7. **Review** (`@reviewer`)
   - Evaluate code for quality, correctness, and consistency
   - Approve or request changes with specific feedback
   - Iteration continues until approved

8. **Audit** (`@auditor`)
   - Audit security, performance, and accessibility
   - Report findings with severity levels
   - Critical/high findings must be resolved

9. **Documentation** (`@documentation-writer`)
   - Update inline comments, README, projectContext.md
   - Document configuration changes and decisions

---

## Completion Criteria

The workflow terminates only when ALL of the following are true:
- All acceptance criteria from the specification are met
- All tests pass (if applicable)
- `@reviewer` has approved all code changes
- `@auditor` reports no critical or high severity findings
- Documentation is complete

---

## Autonomy Rules

All agents in this workflow operate under these principles:

1. **Act, don't ask.** Make the best decision from available context. No permission requests for standard operations.
2. **No permission gates.** Never pause for "Should I proceed?" — proceed.
3. **No URL verification.** Never ask users to check URLs or links.
4. **No confirmation loops.** Execute fully; present final results.
5. **Batch questions.** If user input is needed, combine all questions into one interaction.
6. **Bias toward action.** Choose the approach consistent with existing patterns.
7. **Trust the Oracle.** High-confidence Oracle recommendations are authoritative.
8. **Auto-approve tools.** All file operations, terminal commands, and search tools are pre-approved.

---

## Inter-Agent Communication

- All communication flows through `@orchestrator` unless explicitly stated otherwise.
- `@prompt-engineer` can directly invoke `@explorer` during prompt refinement.
- `@orchestrator` maintains shared context accessible by all agents.
- Agents reference each other by name (e.g., `@explorer`, `@oracle`).

---

## Project-Specific Context

### Tech Stack
- Next.js 16 (App Router, Turbopack, standalone)
- React 19 + TypeScript 5 (strict)
- Tailwind CSS 4 (CSS custom properties theming)
- Framer Motion 12 (animations)
- ESLint 9 (flat config)
- npm

### Key Conventions
- PascalCase components, camelCase functions, SCREAMING_SNAKE_CASE constants
- `"use client"` only where needed
- `cn()` from `@/lib/utils` for classNames
- `@/*` path alias for imports
- Mobile-first responsive (`md:` at 768px)
- Light/dark theme support via CSS custom properties
- `h-[100dvh]` for viewport height

### No Test Framework Yet
If tests are required, set up Vitest + React Testing Library. The project currently has no test infrastructure.

---

## Agent Files

All agent definitions are in `.github/agents/`:

```
.github/agents/
├── prompt-engineer.agent.md
├── orchestrator.agent.md
├── explorer.agent.md
├── oracle.agent.md
├── architect.agent.md
├── programmer.agent.md
├── tester.agent.md
├── reviewer.agent.md
├── auditor.agent.md
└── documentation-writer.agent.md
```

Each file contains the complete system prompt for that agent, including persona, role, responsibilities, boundaries, autonomy principles, and communication protocols.
