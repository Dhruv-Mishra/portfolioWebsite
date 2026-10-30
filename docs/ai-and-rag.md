# AI and RAG

The chat route accepts only model IDs defined in [the model registry](../portfolio/lib/chatModels.ts). Provider credentials stay on the server. The selected model determines the provider path; a provider failure produces a local static fallback rather than switching to another selected model.

## Current Model Registry

The active catalog contains seven entries: one Groq default, three NVIDIA models, two optional local-agent models, and one on-device model that is currently disabled.

| Group | Model | Image input | Registry role |
|---|---|---:|---|
| Recommended | Groq Qwen 3.8 27B | Yes | Default selection |
| NVIDIA | MiniMax M3.1 Flash | Yes | Research and development use only |
| NVIDIA | DeepSeek V4.1 Flash | Yes | Fast; also generates suggestions |
| NVIDIA | Nemotron 3.5 Super VL 120B | Yes | Strong reasoning (thinking on) |
| Local agent | Qwen3.5 4B | No | Self-hosted text model |
| Local agent | LFM3 Omni 2B | Yes | Self-hosted vision model |
| On device | LFM3 1.7B | No | Runs in the browser with WebGPU; disabled |

Both local-agent entries require `LOCAL_AGENT_BASE_URL` and `LOCAL_AGENT_API_KEY` and share one endpoint; the gateway routes by model ID. Staging and production deploys inject `https://llm.whoisdhruv.com/v1` plus the matching `STAGING_LOCAL_AGENT_API_KEY` / `PRODUCTION_LOCAL_AGENT_API_KEY` secret. The default entry requires `GROQ_API_KEY`; NVIDIA selections require `NVIDIA_API_KEY`. An unsupported ID is rejected before a provider is called.

## Streamed Replies

The chat client sends `stream: true`. Once a request reaches a provider, the route answers with `application/x-ndjson`: `delta` events carry provisional, sanitized text (reasoning blocks and trailing tool artifacts are withheld), and one final `done` event carries the finalized, signed reply plus `degraded`/`fallbackReason` when a fallback was used. Validation errors, canned intents, and pre-provider fallbacks stay plain JSON, and requests without `stream: true` get the JSON reply as before. A provider that fails after text was shown is not retried or replaced. The note types the stream forward from the shared prefix, catches up on long backlogs, and eases its height as lines wrap; TTS and actions start only on the final text.

## Reply Length

Small local models fill whatever output budget they get, so length is controlled in two places that share one classifier ([replyLength.ts](../portfolio/lib/replyLength.ts)). Each turn is `brief` (greetings, thanks), `detailed` (explain, compare, walk through, tell me more), or `standard`. The matching hint (one sentence / under 60 words / under 150 words) is the last line of the per-turn context, closest to the visitor's message. Local models also get a matching `max_tokens` cap of 80, 160, or 360 under the 512-token server ceiling. Token-limited replies retain the provider's text rather than guessing sentence boundaries and discarding content. Speech normalization happens in code (`adaptTextForSpeech`), so the prompt carries no TTS rules.

## Local Agent Endpoint

`llm.whoisdhruv.com` runs two models on a 4-core Arm Neoverse-N1 VM (`ARM_Hunar`) with a native llama.cpp `b11982` build: Qwen3.5 4B for text and `LFM3-Omni-2B-Q4_0` with the `Q8_0` projector for images. The setup files live in [portfolio/scripts/local-llm](../portfolio/scripts/local-llm): `install.sh`, the `llm-server`, `llm-omni`, and `llm-gateway` systemd units with their env files, the nginx site, and the `toolbench` benchmark.

- Request path: Cloudflare, then nginx, then `llm-gateway` (`127.0.0.1:8081`), then `llm-server` (`127.0.0.1:8080`) or `llm-omni` (`127.0.0.1:8082`) by the request's `model` field. Unknown models go to the text server. `/v1/models` lists the configured ids of every upstream that answers, in `UPSTREAMS` order (`Qwen3.5-4B` first, then its old aliases, then `LFM3-Omni-2B`), so the site marks each local model healthy separately and older builds that ask for `LFM3-1.7B` keep working.
- Text model: `Qwen3.5-4B-Q4S-E8.gguf`, quantized on the VM from bartowski's BF16 with his imatrix. It is Q4_0 for ARM weight repacking, with `Q8_0` for the tied 248K-token embedding, every `ssm_out`, and the full-attention `attn_q` tensors. bartowski's Q4_0 keeps the embedding at Q6_K, which has no repacked kernel; this mix decodes about 4% faster (10.7 vs 10.3 tokens/s in `llama-bench`) at the same benchmark score. A pure Q4_0 was 20% faster but lost 10 points on tool calls. Sampling is temperature 0.3, top-p 0.8, top-k 20, with thinking off.
- Queue: `llm-gateway` is a dependency-free Node proxy. It checks the bearer key before admitting work, buffers the body (up to `MAX_BODY_BYTES`), and queues it per model. Both servers share the same four cores, so one CPU lane (`MAX_ACTIVE=1`) admits work across both, taking the next job round-robin across the model queues so a burst of image requests cannot starve text chat. Up to `MAX_QUEUE` requests per model wait for at most `MAX_QUEUE_WAIT_MS`. Admission estimates the wait from per-model moving averages, kept separately for text and media prompts, and rejects a request immediately when it would not start in time. Overflow or a stale wait gets `503` with `Retry-After` and an OpenAI-style `server_busy` error. A client that disconnects leaves the queue, and an in-flight disconnect cancels the llama.cpp task. `/health` reports each upstream and the queue depth; `/gateway/stats` stays loopback-only.
- Omni model: on this CPU its text speed is about 126 prompt and 29 generated tokens/s. `--image-max-tokens 256` cuts a 1024 px photo from about 750 to 256 image tokens, so the image costs about 5 seconds of prompt time instead of 17; the projector quant barely changes encode time, so it stays `Q8_0`. The browser already downscales Omni attachments to that budget (`imageMaxPixels`, 256 x 32 x 32 px), so uploads are about 50 KB instead of up to 128 KB and the server does no extra resizing. Cloud vision models keep the 1280 px limit for detail. Sampling is greedy, as LiquidAI recommends. A 12-second audio clip transcribes in about 2.5 seconds through `input_audio`, but the site only sends text and images: dictation already covers spoken questions, and video costs hundreds of image tokens per second of footage on a CPU.
- Busy handling: the chat route maps provider `429`/`503` to the `provider-busy` fallback reason. Users see a busy reply with a **Try again** button, and the model is not marked as facing issues.
- Prompt cache: Qwen3.5 and LFM3 are hybrid models, so llama.cpp can only resume from a saved checkpoint, not from an arbitrary shared prefix. For both local models the route sends one fixed system message (rules plus the anchor facts). Per-turn blocks and ranked facts go into the latest user message, and history is capped at five messages or 1,600 characters. llama.cpp's first checkpoint lands at the end of that system message, so warm requests skip its roughly 750 tokens and process only the turn (about 180 tokens for a first question). Putting every fact in the cached system message was slower: the checkpoint landed about 300 tokens short and prefill slowed at the longer context.
- Speed: on the VM the 4B text model prefills about 41 tokens/s and generates about 11 tokens/s, so a first question streams its first words after about 4 seconds. The previous LFM3 1.7B was faster (about 1.6 seconds and 27 tokens/s) but failed most tool-calling cases.
- Slots: one per server. Prompt processing is CPU-bound, so extra slots only split the four cores and raise mean latency; the gateway queue handles fairness instead.

## Local Model Benchmark

`portfolio/scripts/local-llm/toolbench.ts` scores an OpenAI-compatible endpoint on 53 tool-calling cases and 18 grounded-chat cases, then reports prefill, decode, hidden-thinking tokens, and time to the first visible token. Tool cases use the real 24-tool site catalog (`siteToolDeclarations.ts`) with direct, indirect, buried-in-long-text, multi-turn ("switch it back"), multi-call, and must-not-call requests, including a prompt injection in pasted text. Chat cases use the production local prompt layout and check grounded facts, hallucination traps, policy, and style. From `portfolio/`:

```bash
npx tsx --conditions=react-server scripts/local-llm/toolbench.ts --base http://127.0.0.1:8080/v1 --label NAME [--think off|on|low|high] [--budget N] [--repeat N]
npx tsx scripts/local-llm/toolbench.ts --compare tmp/toolbench/*.json
```

October 2026 results (quality on a GPU with 2 repeats at each model's sampling; speed and time to first visible token on the VM):

| Model and mode | Tools | Chat | First visible token on VM |
|---|---:|---:|---:|
| **Qwen3.5 4B, thinking off** | **87-90%** | **94%** | **about 4 s** |
| Qwen3.5 4B, thinking 32-80 tokens | 89-95% | 83-89% | 7-13 s |
| Spark-X2.6 4B, thinking off / low (80 tokens) | 68% / 90% | 92% / 86% | 5 s / 13 s |
| MiniCPM5 2B, thinking 120 tokens | 75% | 81% | about 11 s |
| Spark-X2.6 1.7B, thinking low (160 tokens) | 67% | 81% | about 10 s |
| Qwen3.5 2B, thinking 160 tokens | 69% | 78% | about 9 s |
| LFM3 1.7B, thinking 200 tokens / off | 64% / 36% | 78% / 78% | 9 s / 1.6 s |

- Small models need thinking: it doubled Spark 1.7B and LFM3 tool scores. Unbudgeted thinking ran past 1,000 tokens (55 seconds on the VM) at the 90th percentile, so any thinking model needs `reasoning_budget_tokens`; capped budgets lost almost nothing. Even budgeted, the 2B class stayed behind Qwen3.5 4B without thinking while taking twice as long.
- Spark 1.7B Q4_0 without thinking scored 34% against 52% for Q8_0; with thinking the gap closed, and mixed Q8_0-attention quants did not help.
- Abliterated and heretic variants (Qwen3.5 2B/4B, Spark, LFM3) scored the same or lower; Huihui's Qwen3.5 2B gained tool calls but lost chat policy.
- Speculative decoding did not pay off on four CPU cores: Qwen3.5's built-in MTP head accepted about 55% of drafts but decoded slower, and MiniCPM5's DSpark drafter cut decode to 3 tokens/s. Gemma 4 E2B's MTP drafter was the only gain (+28%).

## On-Device Model

The `on-device` entry never reaches a server provider; the chat route rejects it. It is hidden from the picker and rejected as a saved preference while `ON_DEVICE_CHAT_ENABLED` is `false`, because Transformers.js only added the `lfm3` architecture in 4.3.2. The lockfile now has 4.3.2, so the remaining step is a WebGPU smoke test of the pinned model before flipping the flag. When enabled, selecting it in Settings checks for WebGPU with `shader-f16`, asks for consent, then downloads the pinned `daveycodez/LFM3-1.7B-Web` revision (q4f16, about 900 MB) from Hugging Face into the browser cache. That community build re-quantizes the `onnx-community/LFM3-1.7B-ONNX` weights with GPTQ for the fused WebGPU kernels, trims the vocabulary to about 49K tokens, and caps sequences at 16,384 tokens. A Web Worker runs it with Transformers.js. Each turn ranks the static `/chat/facts` corpus locally (anchors plus tag/text matches), so the conversation never leaves the device and server suggestions are skipped. Settings shows download progress and can delete the cached model. Weights live in the Cache API under `transformers-cache`, keyed by the pinned revision URL, so they never go stale in place. The page checks that cache rather than trusting a `localStorage` flag, so evicted weights ask for consent again instead of re-downloading 900 MB silently. A download first checks the storage quota and requests persistent storage, and a successful load prunes files from older revisions. The transformers.js chunk loads only inside the worker; no page preloads it. `/chat/facts` returns 404 while the feature is off.

## Advisory Model Health

`/api/chat/model-status` remains a runtime configuration view. Optionally, it adds a sanitized advisory from the private `Dhruv-Mishra/portfolio-model-health` snapshot repository. The reader uses `GITHUB_MODEL_HEALTH_REPO`, `GITHUB_MODEL_HEALTH_TOKEN`, and `MODEL_HEALTH_ENVIRONMENT` (`staging` or `production`), caches a read for five minutes, and times out after three seconds.

Missing configuration, GitHub failures, malformed snapshots, and expired snapshots are treated as unknown; they never disable a model, reroute a chat, or affect a deployment. Fresh `degraded` and `unhealthy` entries only add the existing non-blocking `Facing issues` indicator in the model picker. Chat routes never write health snapshots.

The `publish-model-health.yml` workflow runs every 10 minutes and probes only the deployed `deploymentCanaryModelIds`. It writes one sanitized snapshot per environment to `status/v1/<environment>.json`; all other known models are recorded as `unknown`. A first failed canary is `degraded`, a second consecutive failure is `unhealthy`, and a successful canary resets the failure count. The existing full-catalog audit remains a separate, non-gating workflow.

## Retrieval Pipeline

1. Markdown files in `portfolio/content/facts/` are converted to an embeddings bundle by `npm run build:embeddings`.
2. The committed `portfolio/lib/facts.embeddings.json` bundle is loaded at runtime.
3. Non-anchor facts qualify only when the query contains one of their curated `tags` (a trailing `s` also matches). The query is embedded with the same model, then qualifying facts are ranked by cosine similarity. A question that matches no tag gets anchors only, so unrelated facts are never injected.
4. Anchor facts are always included first. If query embedding is unavailable, retrieval degrades to priority-ordered facts instead of failing the chat request.

The query joins the last three user turns so follow-ups keep their topic. The self-hosted local models use only the latest turn, because a small model recites whatever notes it is handed. Keep tags specific: filler words such as `about`, `help`, or `talk` match unrelated questions. Tag edits need `EMBEDDINGS_MODE=local npm run build:embeddings` to refresh the bundle.

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