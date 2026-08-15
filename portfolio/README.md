# portfolio

The Next.js application for [whoisdhruv.com](https://whoisdhruv.com). The root [README](../README.md) is the public overview; detailed operator guidance lives in the focused documents below.

## Commands

```bash
npm install
npm run dev
```

Open http://localhost:3000.

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Run the embedding prebuild and produce standalone output |
| `npm run start` | Run the production server locally |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run strict TypeScript checks |
| `npm test` | Run the Vitest suite |
| `npm run tts:smoke` | Verify local Pocket TTS synthesis |

## Runtime Facts

- Node 22, npm 10.9.8, Next.js 16 standalone output, Docker image delivery, and Linux VMs behind Cloudflare and Nginx are the supported production path.
- `content/facts/**/*.md` and the committed `lib/facts.embeddings.json` power public Markdown routes and grounded chat. Keep both under version control.
- Chat allows one Groq default, three NVIDIA selections, and a text-only local agent. Staging and production deploys inject `LOCAL_AGENT_BASE_URL` plus the matching `STAGING_LOCAL_AGENT_API_KEY` / `PRODUCTION_LOCAL_AGENT_API_KEY` secret. It executes the visitor's selected allowlisted model exactly; unavailable providers return the signed local fallback rather than substituting another model.
- The model picker reads a 30-second same-origin status snapshot for configured-unavailable models, deployment canaries, and local-agent health. A failed request marks the selected model as having issues for that browser tab only.
- Pocket TTS runs on the local gateway role. Remote VM roles forward only `POST /api/tts` privately; browser playback falls back to device speech if custom voice fails.
- Staging and production validate each VM, release SHA, runtime health, and TTS synthesis before activation. A runner-only Cloudflare bot challenge is warning-only after VM-local checks pass; other public-edge non-200 results remain fatal.

## Configuration

Copy [.env.example](.env.example) for local setup. Provider keys, signing secrets, GitHub tokens, and TTS credentials are server-only; never expose them with `NEXT_PUBLIC_*`.

| Area | Primary configuration |
|---|---|
| Chat | `GROQ_API_KEY`, `NVIDIA_API_KEY`, `LOCAL_AGENT_BASE_URL`, `LOCAL_AGENT_API_KEY`, `VOICE_AGENT_API_KEY` |
| Retrieval | `EMBEDDINGS_API_KEY`, `EMBEDDINGS_BASE_URL`, `EMBEDDINGS_MODEL`, `EMBEDDINGS_MODE`, `SKIP_EMBEDDINGS_BUILD` |
| TTS | `HF_TOKEN`, `LOCAL_TTS_CACHE_DIR`, `TTS_NODE_MODE`, `TTS_BACKEND_URL`, `TTS_BACKEND_TOKEN` |
| Security | `CHAT_HISTORY_SIGNING_SECRET`, `MATRIX_NOTES_ACCESS_SECRET` |

## Delivery

- [Dockerfile](Dockerfile) builds the multi-architecture image with the standalone app and Pocket TTS runtime.
- `prepare-release` creates or reuses a minor-version release branch and reports an **Open release PR** compare link. Open and merge that PR into `dev/lkg` manually (or with an authorized client), then run `promote-release` to fast-forward that exact release SHA to `deployed/staging`. Production fast-forwards the approved staged release to `deployed/production`.
- Staging serves `staging.whoisdhruv.com` as `portfolio-staging` on port `3010`; production serves `whoisdhruv.com` as `portfolio`.

## Focused Guides

- [Architecture](../docs/architecture.md): boundaries, request paths, delivery shape, and model health.
- [API](../docs/api.md): browser-facing endpoint contracts.
- [AI and RAG](../docs/ai-and-rag.md): model registry, retrieval, and provider configuration.
- [TTS](../docs/tts.md): Pocket TTS roles, streaming, and smoke checks.
- [Deployment](../docs/deployment.md): promotion, VM delivery, rollback, and operator checks.

Detailed configuration remains in the linked guides.
