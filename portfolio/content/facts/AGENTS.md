# Agent Guide

Scope: markdown facts used by chat retrieval and embeddings.

## Fact Rules

- Every fact file needs YAML frontmatter with `id`, `tags`, `priority`, `anchor`, and optional `category` or `slug`.
- Keep facts factual, concise, and safe to show to users through chat grounding.
- Do not include secrets, private infrastructure details, hidden unlock mechanics, or unverified claims.
- Anchor facts should be stable identity or high-priority grounding information.

## Embeddings

- `lib/facts.embeddings.json` is generated from this corpus and committed for deploy fallback.
- Run `rtk npm run build:embeddings` when intentionally changing semantic retrieval data and credentials/local mode are available.
- If credentials are unavailable, set `SKIP_EMBEDDINGS_BUILD=1` for unrelated builds.