# Agent Guide

Scope: build, embedding, deployment, smoke-test, and maintenance scripts.

## Script Rules

- Keep scripts non-interactive by default so GitHub Actions and agents can run them safely.
- Avoid hard-coded secrets, VM hostnames, or local absolute paths.
- Preserve staging identity checks: `portfolio-staging`, `staging.whoisdhruv.com`, `NEXTJS_PORT=3010`, and `GIT_BRANCH=deployed/staging`.
- For shell scripts, keep failure behavior explicit and quote paths/variables that may contain spaces.

## Validation

- Run the narrow script or smoke command when editing a script.
- For deploy scripts, inspect both staging and production workflow callers before changing arguments or expected environment variables.