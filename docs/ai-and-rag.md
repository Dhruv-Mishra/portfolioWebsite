# AI and RAG

The chat route accepts only model IDs defined in [the model registry](../portfolio/lib/chatModels.ts). Provider credentials stay on the server. The selected model determines the provider path; a provider failure produces a local static fallback rather than switching to another selected model.

## Current Model Registry

The active catalog contains five selections: one Groq default, three NVIDIA models, and one optional local agent.

| Group | Model | Image input | Registry role |
|---|---|---:|---|
| Recommended | Groq Qwen 3.6 27B | Yes | Default selection |
| NVIDIA | MiniMax M3 | Yes | Preview; non-commercial use only |
| NVIDIA | DeepSeek V4 Flash | No | Fast |
| NVIDIA | Nemotron 3 Super 120B | No | Strong reasoning |
| Local agent | Local model | No | Optional OpenAI-compatible endpoint |

The local-agent entry requires both `LOCAL_AGENT_BASE_URL` and `LOCAL_AGENT_API_KEY`. Staging and production deploys inject `https://llm.whoisdhruv.com/v1` plus the matching `STAGING_LOCAL_AGENT_API_KEY` / `PRODUCTION_LOCAL_AGENT_API_KEY` secret. The default entry requires `GROQ_API_KEY`; NVIDIA selections require `NVIDIA_API_KEY`. An unsupported ID is rejected before a provider is called.

## Advisory Model Health

`/api/chat/model-status` remains a runtime configuration view. Optionally, it adds a sanitized advisory from the private `Dhruv-Mishra/portfolio-model-health` snapshot repository. The reader uses `GITHUB_MODEL_HEALTH_REPO`, `GITHUB_MODEL_HEALTH_TOKEN`, and `MODEL_HEALTH_ENVIRONMENT` (`staging` or `production`), caches a read for five minutes, and times out after three seconds.

Missing configuration, GitHub failures, malformed snapshots, and expired snapshots are treated as unknown; they never disable a model, reroute a chat, or affect a deployment. Fresh `degraded` and `unhealthy` entries only add the existing non-blocking `Facing issues` indicator in the model picker. Chat routes never write health snapshots.

The `publish-model-health.yml` workflow runs every 10 minutes and probes only the deployed `deploymentCanaryModelIds`. It writes one sanitized snapshot per environment to `status/v1/<environment>.json`; all other known models are recorded as `unknown`. A first failed canary is `degraded`, a second consecutive failure is `unhealthy`, and a successful canary resets the failure count. The existing full-catalog audit remains a separate, non-gating workflow.

## Retrieval Pipeline

1. Markdown files in `portfolio/content/facts/` are converted to an embeddings bundle by `bun run build:embeddings`.
2. The committed `portfolio/lib/facts.embeddings.json` bundle is loaded at runtime.
3. The query is embedded with the same model, then non-anchor facts are ranked by cosine similarity.
4. Anchor facts are always included first. If query embedding is unavailable, retrieval degrades to priority-ordered facts instead of failing the chat request.

`EMBEDDINGS_MODE=local` uses deterministic hashed n-gram embeddings for local development and CI. `SKIP_EMBEDDINGS_BUILD=1` reuses the committed bundle during a build. With external embeddings, configure `EMBEDDINGS_API_KEY` and optionally `EMBEDDINGS_BASE_URL` and `EMBEDDINGS_MODEL`; `LLM_API_KEY` and `LLM_BASE_URL` are compatible fallbacks for embeddings, not chat-model fallbacks.

## Chat Boundary

- Assistant messages must carry a valid HMAC signature before the server reuses them as conversation history.
- User text, history length, body size, image data, and model IDs are bounded and validated before provider calls.
- Image input is accepted only for registry entries that support it.
- Provider replies are normalized and sanitized before they are returned to the browser.

The chat route builds its system context from the retrieval pipeline, then calls only the provider configured for the selected model. Read [API](api.md) for the browser contract and rate limits.

## Documentation Map

| Guide | Use it for |
|---|---|
| [Architecture](architecture.md) | Runtime boundaries and request flow |
| [API](api.md) | Browser-facing endpoint contracts and controls |
| [AI and RAG](ai-and-rag.md) | Model selection, retrieval, and server configuration |
| [TTS](tts.md) | Pocket TTS behavior and gateway operations |
| [Deployment](deployment.md) | Promotion, container delivery, rollback, and operator checks |