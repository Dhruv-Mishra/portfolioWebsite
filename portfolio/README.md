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
| `npm run tts:smoke` | Load local Pocket TTS and write `tmp/local-tts-smoke.wav` |
| `npm run build:embeddings` | Regenerate `lib/facts.embeddings.json` |
| `npm run prepare` | Install git hooks |

## Container Image

Production image builds use [Dockerfile](Dockerfile). The image includes the Node standalone server, static assets, deploy/nginx templates, Python 3, and the CPU-only Pocket TTS runtime. This feature requires image mode: artifact mode fails fast because it cannot bundle the Python runtime. Image construction verifies Pocket TTS, Torch, TorchAO, and SoundFile imports; deploy performs real synthesis and rolls back if it fails before workflow metadata checks run.

```bash
docker build \
	--build-arg NEXT_BUILD_ID=$(git rev-parse HEAD) \
	-t portfolio:local .

docker run --rm --env-file .env.local \
	-p 127.0.0.1:3000:3000 \
	-v portfolio-tts-cache:/var/cache/portfolio/pocket-tts \
	portfolio:local
```

Fresh Ubuntu VMs can be prepared for image deploys with [scripts/bootstrap-docker-vm.sh](scripts/bootstrap-docker-vm.sh). The runtime target is Linux VMs behind Cloudflare and Nginx, running the Next.js standalone server. Docker image mode is the staging and production deploy path for Pocket TTS.

## Deployment Environments

| Environment | Branch / workflow | Domain | Runtime |
|---|---|---|---|
| Development | `dev/lkg` | local | Primary branch for reviewed source changes |
| Staging | `deployed/staging` | `staging.whoisdhruv.com` | Docker image deploy to `portfolio-staging` |
| Production | `deployed/production` | `whoisdhruv.com` | Docker image deploy to `portfolio` |

For staging, each VM must expose a separate `portfolio-staging` site contract: `/etc/deploy/sites/portfolio-staging.conf`, `DOMAIN="staging.whoisdhruv.com"`, `SERVICE_NAME="portfolio-staging"`, `DOCKER_CONTAINER_NAME="portfolio-staging"`, `NEXTJS_PORT=3010`, `GIT_BRANCH="deployed/staging"`, and `/opt/portfolio-staging/config/.env.local` with `NEXT_PUBLIC_SITE_URL` and `SITE_URL` set to `https://staging.whoisdhruv.com`. The staging workflow hard-codes this identity, validates it over SSH before deploy, verifies the deployed SHA on every VM, and treats a Cloudflare bot challenge to the GitHub runner as a warning after VM-local checks have passed. Real non-200 Cloudflare responses still fail the workflow. Add `GHCR_READ_TOKEN` if the GHCR package is private or the VMs are not already logged in.

Staging image deploys publish both `linux/amd64` and `linux/arm64` images because the staging VM fleet is mixed architecture. Deploy builds use `next build --webpack` instead of Turbopack so both platform images emit the same HTML-referenced `/_next/static` graph, and the workflow verifies those assets through both local nginx and Cloudflare.

Promotion is branch-based: run `Promote dev/lkg to Staging` to fast-forward `deployed/staging`, then run `Promote Staging to Production` to fast-forward `deployed/production`. The promotion workflows use `GITHUB_TOKEN` and explicitly dispatch the matching deploy workflow so they do not double-trigger deploys. Direct human pushes to either deployed branch still trigger the matching deploy workflow. Use `Rollback Portfolio Production` to restore the newest previous retained production release, or provide a retained release SHA.

Runtime signing values use four repository-level Actions secrets: `STAGING_CHAT_HISTORY_SIGNING_SECRET`, `STAGING_MATRIX_NOTES_ACCESS_SECRET`, `PRODUCTION_CHAT_HISTORY_SIGNING_SECRET`, and `PRODUCTION_MATRIX_NOTES_ACCESS_SECRET`. Each deploy validates 64-character hexadecimal values and atomically synchronizes the appropriate pair into every VM's persisted service env file before restart. Pocket TTS additionally requires repository-level `STAGING_HF_TOKEN` and `PRODUCTION_HF_TOKEN`, which may be the same least-privilege Hugging Face read token. See [../VMChangesRequired.md](../VMChangesRequired.md) for the one-time setup; routine promotions require no manual VM secret updates.

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
- Voice output settings offer **Device TTS** (the default) and **Server custom**. Any selected server failure falls back to device speech. Playback speed is client-side.
- Server custom uses Pocket TTS 2.1 with `public/sounds/voice/TTSReference.mp3`, one resident worker, one active inference, and int8 quantization by default. It runs CPU-only Torch 2.10 and persistently caches model data at `/var/cache/<service>/pocket-tts`, including the derived `custom-dhruv.safetensors` voice state.
- GET `/api/tts` is status-only; POST is the synthesis path. Native server streaming is 24 kHz mono PCM16 (`pcm_s16le`) through same-origin REST with `Accept: application/x-ndjson` or `{ "stream": true }`. Send `X-TTS-Accept-Compression: gzip` only when the browser can decompress frames: each frame uses gzip only when it is at least 10% smaller after metadata overhead. The browser decompresses accepted frames and caches raw PCM in IndexedDB; clearing chat clears generated audio.
- Local setup supports Python 3.10 through 3.14. Run `pip install -r requirements-tts.txt`, set `HF_TOKEN`, accept the gated terms at <https://huggingface.co/kyutai/pocket-tts>, then run `npm run tts:smoke`. The requirements file selects CPU wheels; no separate phonemizer installation is needed.
- The worker honors `LOCAL_TTS_PYTHON`, otherwise it prefers a workspace `.venv` before `python` / `python3`. `LOCAL_TTS_CACHE_DIR` defaults to `~/.cache/portfolio/pocket-tts`; set `HF_HUB_OFFLINE=1` or `LOCAL_TTS_OFFLINE=1` only after a successful warmed download.
- The reference asset at `public/sounds/voice/TTSReference.mp3` is publicly served. To keep a private reference outside the image, set `LOCAL_TTS_REFERENCE_HOST_PATH` in the persisted deployment env to an absolute host file path containing only letters, digits, `_`, `.`, `/`, and `-`, with no whitespace. Deployment verifies the file and mounts it read-only at `/run/secrets/tts-reference` without exposing the host path to the container.
- Pocket TTS software is MIT. Its model weights are CC BY 4.0 and subject to gated prohibited-use terms. Voice cloning needs explicit lawful consent and must not deceive or impersonate; the deploy owner must confirm that the reference voice is theirs or used with consent.
- Speech-safe text rules live in `lib/ttsPrompts.ts`; `/api/tts` adapts displayed replies into speech-safe text without mutating saved chat messages.
- For production nginx, disable buffering on `/api/tts` just like `/api/chat`: `proxy_buffering off; proxy_cache off; proxy_read_timeout 120s;`.

### Pocket TTS Environment

| Variable | Purpose |
|---|---|
| `HF_TOKEN` | Read token for the gated first download; keep it server-side or in the matching repository Actions secret. |
| `LOCAL_TTS_CACHE_DIR` | Persistent model and derived voice-state cache; production uses `/var/cache/<service>/pocket-tts`. |
| `LOCAL_TTS_REFERENCE_HOST_PATH` | Absolute host path to a private reference file containing only letters, digits, `_`, `.`, `/`, and `-`, with no whitespace; image deploys mount it read-only at `/run/secrets/tts-reference`. |
| `LOCAL_TTS_REFERENCE_PATH` | Absolute in-container reference path when no host reference is configured; defaults to the bundled public `TTSReference.mp3`. |
| `LOCAL_TTS_PYTHON` | Explicit Python interpreter when the workspace `.venv` should not be selected. |
| `LOCAL_TTS_QUANTIZE` | Controls int8 quantization; defaults to `true`. |
| `HF_HUB_OFFLINE`, `LOCAL_TTS_OFFLINE` | Enable offline cache-only operation after a successful warmup. |

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
