# portfolio

This directory contains the Next.js app for [whoisdhruv.com](https://whoisdhruv.com). The root [README](../README.md) is the main project overview; this file is the quick package-level reference.

## Commands

```bash
npm install
npm run dev
```

Open http://localhost:3000.

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build (`prebuild` runs first) |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest suite |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run build:embeddings` | Regenerate `lib/facts.embeddings.json` |
| `npm run prepare` | Install git hooks |

## Structure

```text
app/              routes and API handlers
components/       UI, terminal, chat, stickers, guestbook, layout
content/facts/    markdown fact corpus used for retrieval
context/          React providers
hooks/            client hooks
lib/              commands, integrations, retrieval, utilities
public/           static assets
scripts/          embeddings and deployment helpers
```

## Runtime Notes

- Chat is Groq-first when configured, with OpenAI-compatible fallback support through `LLM_*` variables.
- Guestbook, feedback, and notes flows are GitHub-backed.
- `npm run build` triggers embeddings generation unless skipped via env.
