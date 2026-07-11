# portfolio

This directory contains the Next.js app for [whoisdhruv.com](https://whoisdhruv.com). The root [README](../README.md) is the public overview; this file is the package-level reference for local work, runtime notes, and deployment contracts.

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
| `npm run tts:smoke` | Load local KittenTTS and write `tmp/local-tts-smoke.wav` |
| `npm run build:embeddings` | Regenerate `lib/facts.embeddings.json` |
| `npm run prepare` | Install git hooks |

## Container Image

Production image builds use [Dockerfile](Dockerfile) and keep the same Next.js standalone contract as the VM artifact deploy. The image includes the Node standalone server, static assets, deploy/nginx templates, Python, KittenTTS dependencies, and eSpeak NG.

```bash
docker build \
	--build-arg NEXT_BUILD_ID=$(git rev-parse HEAD) \
	-t portfolio:local .

docker run --rm --env-file .env.local \
	-p 127.0.0.1:3000:3000 \
	-v portfolio-tts-cache:/var/cache/portfolio/kitten-tts \
	portfolio:local
```

Fresh Ubuntu VMs can be prepared for image deploys with [scripts/bootstrap-docker-vm.sh](scripts/bootstrap-docker-vm.sh). The runtime target is Linux VMs behind Cloudflare and Nginx, running the Next.js standalone server. Docker image mode is the default staging and production deploy path; artifact mode remains available as a fallback.

## Deployment Environments

| Environment | Branch / workflow | Domain | Runtime |
|---|---|---|---|
| Development | `dev/lkg` | local | Primary branch for reviewed source changes |
| Staging | `deployed/staging` | `staging.whoisdhruv.com` | Docker image deploy to `portfolio-staging` |
| Production | `deployed/production` | `whoisdhruv.com` | Docker image deploy to `portfolio` |

For staging, each VM must expose a separate `portfolio-staging` site contract: `/etc/deploy/sites/portfolio-staging.conf`, `DOMAIN="staging.whoisdhruv.com"`, `SERVICE_NAME="portfolio-staging"`, `DOCKER_CONTAINER_NAME="portfolio-staging"`, `NEXTJS_PORT=3010`, `GIT_BRANCH="deployed/staging"`, and `/opt/portfolio-staging/config/.env.local` with `NEXT_PUBLIC_SITE_URL` and `SITE_URL` set to `https://staging.whoisdhruv.com`. The staging workflow hard-codes this identity, validates it over SSH before deploy, verifies the deployed SHA on every VM, and treats a Cloudflare bot challenge to the GitHub runner as a warning after VM-local checks have passed. Real non-200 Cloudflare responses still fail the workflow. Add `GHCR_READ_TOKEN` if the GHCR package is private or the VMs are not already logged in.

Staging image deploys publish both `linux/amd64` and `linux/arm64` images because the staging VM fleet is mixed architecture. Deploy builds use `next build --webpack` instead of Turbopack so both platform images emit the same HTML-referenced `/_next/static` graph, and the workflow verifies those assets through both local nginx and Cloudflare.

Promotion is branch-based: run `Promote dev/lkg to Staging` to fast-forward `deployed/staging`, then run `Promote Staging to Production` to fast-forward `deployed/production`. The promotion workflows use `GITHUB_TOKEN` and explicitly dispatch the matching deploy workflow so they do not double-trigger deploys. Direct human pushes to either deployed branch still trigger the matching deploy workflow. Use `Rollback Portfolio Production` to restore the newest previous retained production release, or provide a retained release SHA.

Runtime signing values use four repository-level Actions secrets: `STAGING_CHAT_HISTORY_SIGNING_SECRET`, `STAGING_MATRIX_NOTES_ACCESS_SECRET`, `PRODUCTION_CHAT_HISTORY_SIGNING_SECRET`, and `PRODUCTION_MATRIX_NOTES_ACCESS_SECRET`. Each deploy validates 64-character hexadecimal values and atomically synchronizes the appropriate pair into every VM's persisted service env file before restart. See [../stepstofollow.md](../stepstofollow.md) for the one-time setup; routine promotions require no manual VM secret updates.

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

- Runtime markdown routes and `content/facts/**/*.md` are product content, not documentation bloat. They feed public markdown surfaces and chat retrieval.
- Chat is Groq-first when configured, with OpenAI-compatible fallback support through `LLM_*` variables.
- Each deployed environment requires a dedicated `CHAT_HISTORY_SIGNING_SECRET`; provider API keys are never used to sign chat history.
- Each deployed environment requires a dedicated `MATRIX_NOTES_ACCESS_SECRET`; Matrix Notes pages and APIs reject requests without a valid signed HttpOnly cookie.
- Guestbook, feedback, and notes flows are GitHub-backed. Visitor IPs and browser user-agent details are not persisted. Optional feedback contact information is written to the configured feedback issue for follow-up, so deployments that retain contact must use a private repository.
- `npm run build` triggers embeddings generation unless skipped via env.
- Local TTS lives at `/api/tts` and runs KittenTTS nano 0.1 through a lazy server-side Python worker. GET is status-only; POST is the only synthesis path. Install Python deps with `pip install -r requirements-tts.txt`, and install native eSpeak NG for phonemization.
- Local TTS caches models under `~/.cache/portfolio/kitten-tts` by default; set `LOCAL_TTS_CACHE_DIR` to override it.
- On Windows, install eSpeak NG and restart the dev server. If phonemizer cannot auto-detect it, set `LOCAL_TTS_ESPEAK_LIBRARY` to the full `libespeak-ng.dll` path, for example `C:\Program Files\eSpeak NG\libespeak-ng.dll`.
- The worker uses `LOCAL_TTS_PYTHON` when set, otherwise it auto-prefers a workspace `.venv` before falling back to `python` / `python3`.
- The model stays server-side by design. On first use, the worker downloads KittenTTS ONNX assets into `LOCAL_TTS_CACHE_DIR`; synthesis runs locally after that. The Hugging Face unauthenticated warning is only about first download/cache access. Set `HF_TOKEN` for higher Hub limits, set `LOCAL_TTS_OFFLINE=1` after the files are cached, or set `LOCAL_TTS_MODEL_PATH` + `LOCAL_TTS_VOICES_PATH` for fully pinned local files.
- Default low-latency CPU settings for the 4 ARM vCPU Oracle VM are `LOCAL_TTS_INTRA_OP_THREADS=1`, `LOCAL_TTS_INTER_OP_THREADS=1`, `LOCAL_TTS_CONCURRENCY=1`, `LOCAL_TTS_MAX_QUEUE=4`, `LOCAL_TTS_CHUNK_CHARS=120`, and `LOCAL_TTS_CACHE_DIR=/var/cache/portfolio/kitten-tts`. Tune chunking in the `120-160` range when balancing time-to-first-audio against prosody.
- Voice/speed defaults are `expr-voice-5-m` and `1`. Prefer setting `NEXT_PUBLIC_TTS_VOICE` and `NEXT_PUBLIC_TTS_SPEED` in `.env.local` before build so browser requests and cache keys match the server. `LOCAL_TTS_VOICE` and `LOCAL_TTS_SPEED` can override server-only defaults for non-browser/API callers. Allowed voices are `expr-voice-2-m`, `expr-voice-2-f`, `expr-voice-3-m`, `expr-voice-3-f`, `expr-voice-4-m`, `expr-voice-4-f`, `expr-voice-5-m`, and `expr-voice-5-f`. Speed is clamped to `0.85` through `1.15`.
- In production systemd, prefer `CacheDirectory=portfolio/kitten-tts`. If you manually manage `/var/cache/portfolio/kitten-tts`, also grant it through `ReadWritePaths` when `ProtectSystem=strict` is enabled.
- `/api/tts` returns 24 kHz mono PCM16 WAV by default. Streaming mode uses same-origin REST POST with `Accept: application/x-ndjson` or `{ "stream": true }`, emitting base64 `pcm_s16le` chunks.
- Assistant response playback uses the streaming `/api/tts` path and caches completed spoken text/options in IndexedDB with per-message associations. Clearing chat clears the generated-audio cache too.
- Speech-safe text rules live in `lib/ttsPrompts.ts`; `/api/tts` adapts displayed replies into speech-safe text without mutating saved chat messages.
- For production nginx, disable buffering on `/api/tts` just like `/api/chat`: `proxy_buffering off; proxy_cache off; proxy_read_timeout 120s;`.
- Local Transcription runs `Xenova/whisper-tiny` in a same-origin browser worker; recorded audio stays in the browser, and only text is submitted when the visitor sends the form. First use fetches model files from `huggingface.co` (large weights redirect to `us.aws.cdn.hf.co`) and the pinned ONNX runtime from `cdn.jsdelivr.net`. WebGPU currently requests about 144.5 MiB of model weights; the WASM fallback requests about 39.0 MiB of quantized weights; ONNX WASM runtime files add about 22.5 MiB, plus small configuration/tokenizer files.
- Transformers.js stores downloaded model/runtime responses in browser Cache Storage when available. Reuse is best-effort: browser eviction, private browsing, or clearing site data can require another download. The deployed CSP must retain the three hosts above, `script-src blob: 'wasm-unsafe-eval'` for the cached ONNX factory/WASM compilation, and `worker-src 'self'` for the compiled Whisper worker.

## AI And Retrieval Configuration

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY`, `GROQ_MODEL` | Primary chat provider and optional model override |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | OpenAI-compatible fallback provider |
| `LLM_FALLBACK_API_KEY`, `LLM_FALLBACK_BASE_URL`, `LLM_FALLBACK_MODEL` | Secondary fallback provider |
| `EMBEDDINGS_API_KEY`, `EMBEDDINGS_BASE_URL`, `EMBEDDINGS_MODEL` | Optional embeddings provider; API key falls back to `LLM_API_KEY` |
| `EMBEDDINGS_MODE=local` | Generate deterministic hashed n-gram embeddings for dev/CI |
| `SKIP_EMBEDDINGS_BUILD=1` | Reuse committed `lib/facts.embeddings.json` |

When no embeddings key is configured and local mode is off, builds reuse the committed embeddings bundle. Public client configuration such as `NEXT_PUBLIC_SITE_URL`, analytics toggles, and analytics IDs must remain safe to expose; provider credentials are server-only.
