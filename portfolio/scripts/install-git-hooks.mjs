#!/usr/bin/env node
// scripts/install-git-hooks.mjs — Wires the repo's tracked .githooks/ directory
// into the local git clone via `core.hooksPath`. Runs automatically on
// `npm install` via the `prepare` lifecycle script.
//
// Idempotent and safe to skip in environments without git (CI runners that
// install deps from a tarball, dependents that pull this as a dep, etc.).

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const here = dirname(fileURLToPath(import.meta.url));
  // Repo root is the parent of portfolio/. .git lives there; .githooks too.
  const repoRoot = resolve(here, '..', '..');
  if (!existsSync(resolve(repoRoot, '.git'))) {
    // Not a git checkout (e.g. installed as a tarball). Silently skip.
    process.exit(0);
  }

  execSync('git config core.hooksPath .githooks', {
    cwd: repoRoot,
    stdio: 'ignore',
  });
} catch {
  // Never fail `npm install` because hook setup failed.
  process.exit(0);
}
