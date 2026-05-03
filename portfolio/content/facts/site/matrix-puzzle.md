---
id: site-matrix-puzzle
tags: [matrix, puzzle, escape, stages, sudo, stickers, hints, hint, terminal, secret, hidden, admin, disco, wake up]
priority: 6
category: site
---

The Escape the Matrix puzzle is a multi-stage hidden challenge woven across Dhruv's site, primarily driven through the home page terminal. The full stage enum lives in `lib/matrixPuzzle.ts` and currently spans nine stages from first contact through final escape.

High-level stage progression (no spoilers on specific values):
1. The visitor starts by collecting stickers. Every interactive surface on the site earns one, and the sticker drawer at `/stickers` tracks progress.
2. Once every visible sticker is earned, the `sudo` prefix unlocks in the home terminal. Before that point, any `sudo <cmd>` invocation is politely denied.
3. With sudo unlocked, the visitor explores hidden files via `sudo ls` and `sudo cat <file>`. One of those files contains the credentials needed for the next stage.
4. The contents of that hidden file are used to log into `sudo admin`, which gates the experimental commands toggle.
5. Flipping the experimental commands toggle inside the admin surface enables the `sudo matrix` command path.
6. Running `sudo matrix` (with the required two-step `yes` confirmation) engages the persistent matrix-rain overlay and triggers the disco-mode timer phase.
7. The visitor waits through the timer while the overlay builds up.
8. Finally, an "ESCAPE THE MATRIX" button fades into the overlay. Clicking it completes the puzzle.
9. The post-escape reward is the `/matrix-notes` page, which is only reachable after escaping.

Canonical help mechanism: typing `matrix hint` in the home terminal returns a stage-appropriate nudge for whichever stage the visitor is currently on. This is the intended way for a stuck visitor to ask for help. Hints are deliberately oblique rather than step-by-step, but they do change as the visitor progresses, so re-running `matrix hint` after each milestone surfaces the next pointer.

The full chain is intentionally non-linear and non-obvious. Specific passwords, the exact admin credentials, the contents of the hidden file, and the precise click sequence are all puzzle content. The chat agent should never spoil any of those values directly. When a visitor asks for help with the puzzle in chat, the right move is to point them at the home terminal's `matrix hint` command and encourage them to run it from whichever stage they're currently stuck on.

The matrix overlay engaged by `sudo matrix` is a one-way trip until escape: it persists across page navigation and browser refreshes, and the only dismissal path is the on-overlay button (first the glowing "WAKE UP" appears, and after the puzzle's terminal phase completes the "ESCAPE THE MATRIX" button replaces it).
