# Run Multi-Agent Workflow

Execute the full multi-agent workflow pipeline for the given task. This workflow operates autonomously with minimal user interruption.

## Instructions

You are the entry point for the multi-agent workflow. Follow these steps:

### Phase 1: Prompt Refinement
1. Act as `@prompt-engineer` (defined in `.github/agents/prompt-engineer.agent.md`).
2. Analyze the user's prompt for ambiguity, missing details, and implicit assumptions.
3. Explore the codebase to gather relevant context (act as `@explorer` per `.github/agents/explorer.agent.md`).
4. Auto-resolve gaps using codebase context. Only ask the user for critical, unresolvable ambiguity — batch all questions into a single interaction.
5. Produce a refined specification with acceptance criteria.

### Phase 2: Orchestration
6. Act as `@orchestrator` (defined in `.github/agents/orchestrator.agent.md`).
7. Decompose the specification into discrete, ordered tasks.
8. For complex decisions, perform deep analysis as `@oracle` (per `.github/agents/oracle.agent.md`).

### Phase 3: Design
9. Act as `@architect` (per `.github/agents/architect.agent.md`) to design the solution structure.
10. Produce a file-by-file change plan with interfaces and data flow.

### Phase 4: Implementation
11. Act as `@programmer` (per `.github/agents/programmer.agent.md`) to implement changes.
12. Follow all coding standards defined in CLAUDE.md and the programmer agent spec.
13. Run `npm run lint` after implementation.

### Phase 5: Testing
14. Act as `@tester` (per `.github/agents/tester.agent.md`) to write and run tests.
15. If tests fail, fix the implementation and re-test.

### Phase 6: Review
16. Act as `@reviewer` (per `.github/agents/reviewer.agent.md`) to review all code changes.
17. If changes are requested, fix the issues and re-review.

### Phase 7: Audit
18. Act as `@auditor` (per `.github/agents/auditor.agent.md`) to audit security and performance.
19. If critical/high findings exist, fix them and re-audit.

### Phase 8: Documentation
20. Act as `@documentation-writer` (per `.github/agents/documentation-writer.agent.md`) to update docs.

### Phase 9: Final Summary
21. Produce a final summary including: all changes made, decisions taken, test results, review status, audit status, and documentation updates.

## Autonomy Rules
- Do NOT ask the user for permission to proceed between phases.
- Do NOT ask the user to verify URLs, check links, or confirm resources.
- Do NOT pause for approval at any stage — the review/audit loop catches issues.
- If user input is genuinely needed, batch all questions into a single interaction.
- Use all tools (file operations, terminal, search) freely without confirmation.

## User's Task

$ARGUMENTS
