# AI and RAG

The chat route accepts only model IDs defined in [the model registry](../portfolio/lib/chatModels.ts). Provider credentials stay on the server. The selected model determines the provider path; a provider failure produces a local static fallback rather than switching to another selected model.

## Current Model Registry

The active catalog contains eight entries: one Groq default, three NVIDIA models, three optional local-agent models, and one on-device model that is currently disabled.

| Group | Model | Image input | Registry role |
|---|---|---:|---|
| Recommended | Groq Qwen 3.8 27B | Yes | Default selection |
| NVIDIA | MiniMax M3.1 Flash | Yes | Research and development use only |
| NVIDIA | DeepSeek V4.1 Flash | Yes | Fast; also generates suggestions |
| NVIDIA | Nemotron 3.5 Super VL 120B | Yes | Strong reasoning (thinking on) |
| Local agent | Qwen3.5 4B | No | Self-hosted text model |
| Local agent | LFM3 1.7B | No | Self-hosted text model (uncensored fine-tune) |
| Local agent | LFM3 Omni 2B | Yes | Self-hosted vision model |
| On device | LFM3 1.7B | No | Runs in the browser with WebGPU; disabled |

All local-agent entries require `LOCAL_AGENT_BASE_URL` and `LOCAL_AGENT_API_KEY` and share one endpoint; the gateway routes by model ID. Staging and production deploys inject `https://llm.whoisdhruv.com/v1` plus the matching `STAGING_LOCAL_AGENT_API_KEY` / `PRODUCTION_LOCAL_AGENT_API_KEY` secret. The default entry requires `GROQ_API_KEY`; NVIDIA selections require `NVIDIA_API_KEY`. An unsupported ID is rejected before a provider is called.

## Streamed Replies

The chat client sends `stream: true`. Once a request reaches a provider, the route answers with `application/x-ndjson`: `delta` events carry provisional, sanitized text (reasoning blocks and trailing tool artifacts are withheld), and one final `done` event carries the finalized, signed reply plus `degraded`/`fallbackReason` when a fallback was used. Validation errors, canned intents, and pre-provider fallbacks stay plain JSON, and requests without `stream: true` get the JSON reply as before. A provider that fails after text was shown is not retried or replaced. The note types the stream forward from the shared prefix, catches up on long backlogs, and eases its height as lines wrap; TTS and actions start only on the final text.

## Reply Length

Small local models fill whatever output budget they get, so length is controlled in two places that share one classifier ([replyLength.ts](../portfolio/lib/replyLength.ts)). Each turn is `brief` (greetings, thanks), `detailed` (explain, compare, walk through, tell me more), or `standard`. The matching hint (one sentence / under 60 words / under 150 words) is the last line of the per-turn context, closest to the visitor's message. Local models also get a matching `max_tokens` cap of 80, 160, or 360 under the 512-token server ceiling. Token-limited replies retain the provider's text rather than guessing sentence boundaries and discarding content. Speech normalization happens in code (`adaptTextForSpeech`), so the prompt carries no TTS rules.

## Local Agent Endpoint

`llm.whoisdhruv.com` runs three models on a 4-core Arm Neoverse-N1 VM (`ARM_Hunar`) with a native clang build of llama.cpp `b12182`: Qwen3.5 4B and LFM3 1.7B for text, and `LFM3-Omni-2B-Q4_0` with the `Q8_0` projector for images. The setup files live in [portfolio/scripts/local-llm](../portfolio/scripts/local-llm): `install.sh`, the `llm-server@` template (one instance per `llm-server-<name>.env`), the `llm-omni` and `llm-gateway` units with their env files, the nginx site, and the `toolbench` benchmark.

- Request path: Cloudflare, then nginx, then `llm-gateway` (`127.0.0.1:8081`), then `llm-server@qwen` (`127.0.0.1:8080`), `llm-server@lfm3` (`127.0.0.1:8083`) or `llm-omni` (`127.0.0.1:8082`) by the request's `model` field. Unknown models go to the Qwen server. `/v1/models` lists the configured ids of every upstream that answers, in `UPSTREAMS` order, so the site marks each local model healthy separately.
- Qwen3.5 4B: `Qwen3.5-4B-Q4S-E8.gguf`, quantized on the VM from bartowski's BF16 with his imatrix. It is Q4_0 for ARM weight repacking, with `Q8_0` for the tied 248K-token embedding, every `ssm_out`, and the full-attention `attn_q` tensors. bartowski's Q4_0 keeps the embedding at Q6_K, which has no repacked kernel; this mix decodes about 4% faster (10.7 vs 10.3 tokens/s in `llama-bench`) at the same benchmark score. A pure Q4_0 was 20% faster but lost 10 points on tool calls. Sampling is temperature 0.3, top-p 0.8, top-k 20, with thinking off.
- LFM3 1.7B: AtomicChat's `LFM3-1.7B-Uncensored` `AD-Q6_K` GGUF, which is Q6_K with Q8_0 for the tied embedding, attention projections and the outer feed-forward blocks. The VM serves it re-encoded to Q8_0 (`llama-quantize --allow-requantize`), because Neoverse-N1 has fast int8 dot products but no Q6_K fast path: `llama-bench` measures 126 prompt and 21.8 generated tokens/s against 80 and 17.1 for the Q6_K file. The re-encode moves the logits no more than building the same Q6_K file with gcc instead of clang does (KL divergence 0.004). The Q6_K file stays in `/opt/llm/models` for rollback. Sampling is greedy.
- Rejected speedups: KleidiAI doubles prompt speed but re-quantizes the weights per row (KL divergence 0.025, six times the re-encode); a Q4_0 re-encode decodes 29 tokens/s but drifts far more (0.23). LFM3 has no DFlash, EAGLE or MTP drafter, and n-gram lookup slowed decoding to 16.7 tokens/s. vLLM and ONNX Runtime run BF16 or FP32 on Arm CPUs, and N1 has no BF16 instructions. `ubatch` size, transparent huge pages, a Q8_0 KV cache and OpenMP made no difference or were slower.
- Thinking: with thinking off, LFM3 leaks draft text and `</think>` into replies, so it always thinks under a per-request `reasoning_budget_tokens`: 128 tokens when the turn has tools and 32 otherwise. The budget message is a single short line, because llama.cpp decodes each forced token as a separate step.
- Queue: `llm-gateway` is a dependency-free Node proxy. It checks the bearer key before admitting work, buffers the body (up to `MAX_BODY_BYTES`), and queues it per model. All servers share the same four cores, so one CPU lane (`MAX_ACTIVE=1`) admits work across them, taking the next job round-robin across the model queues so a burst of image requests cannot starve text chat. Up to `MAX_QUEUE` requests per model wait for at most `MAX_QUEUE_WAIT_MS`. Admission estimates the wait from per-model moving averages, kept separately for text and media prompts, and rejects a request immediately when it would not start in time. Overflow or a stale wait gets `503` with `Retry-After` and an OpenAI-style `server_busy` error. A client that disconnects leaves the queue, and an in-flight disconnect cancels the llama.cpp task. `/health` reports each upstream and the queue depth; `/gateway/stats` stays loopback-only.
- Omni model: on this CPU its text speed is about 126 prompt and 29 generated tokens/s. `--image-max-tokens 256` cuts a 1024 px photo from about 750 to 256 image tokens, so the image costs about 5 seconds of prompt time instead of 17; the projector quant barely changes encode time, so it stays `Q8_0`. The browser already downscales Omni attachments to that budget (`imageMaxPixels`, 256 x 32 x 32 px), so uploads are about 50 KB instead of up to 128 KB and the server does no extra resizing. Cloud vision models keep the 1280 px limit for detail. Sampling is greedy, as LiquidAI recommends. A 12-second audio clip transcribes in about 2.5 seconds through `input_audio`, but the site only sends text and images: dictation already covers spoken questions, and video costs hundreds of image tokens per second of footage on a CPU.
- Busy handling: the chat route maps provider `429`/`503` to the `provider-busy` fallback reason. Users see a busy reply with a **Try again** button, and the model is not marked as facing issues.
- Prompt cache: Qwen3.5 and LFM3 are hybrid models, so llama.cpp can only resume from a saved checkpoint, which it takes at the start of the latest user message, not from an arbitrary shared prefix. For every local model the route sends one fixed system message (rules plus the anchor facts; tools, when the turn gets them, render into that message), and history is capped at nine messages or 1,600 characters. Qwen3.5 and the omni model get the per-turn blocks and ranked facts at the top of the latest user message, and Qwen3.5 always gets the tools, as benchmarked. LFM3 treated those notes as instructions, so it gets them in a second system message after the visitor's message, and gets tools only on turns that could be a request. `--cache-ram` keeps LFM3's plain prefix (about 850 tokens) and tools prefix (about 1,740) side by side, so warm requests process only the turn. Putting every fact in the cached system message was slower: prefill slows at the longer context.
- Speed: Qwen3.5 prefills about 41 tokens/s and generates about 11, so its first words arrive after about 4 seconds. LFM3 prefills about 115 tokens/s and generates about 19; a warm turn reads about 180 new tokens, and thinking adds most of the wait before the first visible word.
- Slots: one per server. Prompt processing is CPU-bound, so extra slots only split the four cores and raise mean latency; the gateway queue handles fairness instead.

## Local Model Benchmark

`portfolio/scripts/local-llm/toolbench.ts` scores an OpenAI-compatible endpoint on 53 action cases, 32 chat-quality cases, 27 multi-turn harness cases and 30 holdout action cases. The action suite uses the real 24-tool subset with direct, indirect, buried, multi-call and must-not-call requests. The holdout suite covers the same categories in fresh wording, so prompt examples tuned on the action suite can be checked for overfitting. Chat cases use production prompt builders: `--layout local` keeps anchors/system stable and turn notes in the user message, `cloud` uses conditional system context and action-gated tools, and `browser` uses the on-device fact/history builder with no tools. `--profile lfm3` applies the production text-model setup on top of `local`: turn notes as a system message after the visitor's message, the extra local rules, and the per-request thinking budgets. Every layout offers tools only when the latest message has action intent, as the route does. Local/cloud chat replay uses the real seven-tool chat catalog, not the broader voice subset. Chat checks cover grounding, unknowns, topic changes, referential follow-ups, complete multi-part answers, untrusted facts, verified actions, discovery boundaries and concise plain prose; unintended calls fail even with a correct answer.

The harness suite replays the production voice prompt/catalog with selective state fixtures and simulated actions, checking fresh-state grounding, relevant fetches, combined reads, conditional actions, injection resistance and confirmations. These are provider-prompt replays, not full route/signature/retry tests, native WebGPU generation, or native audio/transcription/Gemini Live transport coverage. From `portfolio/`:

```bash
npx tsx --conditions=react-server scripts/local-llm/toolbench.ts --base http://127.0.0.1:8080/v1 --label NAME [--think off|on|low|high] [--budget N] [--repeat N]
npx tsx --conditions=react-server scripts/local-llm/toolbench.ts --base http://127.0.0.1:8080/v1 --model LFM3-1.7B --profile lfm3 --suite tools,chat,harness,holdout --label lfm3
npx tsx scripts/local-llm/toolbench.ts --compare tmp/toolbench/*.json
npx tsx --conditions=react-server scripts/local-llm/toolbench.ts --measure
npx tsx scripts/local-llm/toolbench.ts --base http://127.0.0.1:8080/v1 --label harness --suite harness --repeat 3
npx tsx --conditions=react-server scripts/local-llm/toolbench.ts --base http://127.0.0.1:8080/v1 --suite chat --layout local --repeat 3 --label prompts-after
```

Use `LOCAL_AGENT_API_KEY` for authenticated endpoints and `--model` for the provider's model ID; `401`/`403` abort rather than being scored as model failures. Reports persist layout, per-case system/turn/tool/input bytes, actual serialized request bytes, provider token/cache usage, calls and answers alongside scores and timing. `--measure` runs offline across all three chat layouts; bytes are not tokenizer estimates. Invalid production calls, unnecessary fetches/actions, acting before a read result and loops beyond four model turns fail. Deterministic tests exercise graders, layout assembly, report comparisons and CLI failures against a scripted endpoint. They validate the eval machinery, not model quality.

For A/B iterations, run the same case set, corpus, model, layout and sampling before/after, preferably with three repeats; compare reports and inspect failures alongside input bytes, cache usage and latency. Do not compare percentages across different case sets. Live quality scoring for these changes remains unverified because this checkout has no model credentials.

November prompt compression, measured by executing the checked-in and updated assemblers with facts omitted to isolate instructions:

| Payload | Before bytes | After bytes | Reduction |
|---|---:|---:|---:|
| Stable chat, no tools | 1,243 | 974 | 22% |
| Stable chat, tools | 1,858 | 1,311 | 29% |
| Project-turn guidance | 890 | 384 | 57% |
| First puzzle-help guidance | 2,013 | 581 | 71% |
| Voice rules | 1,838 | 1,643 | 11% |

The stable cache boundary, per-turn length hints, action honesty and secret/submission safeguards remain. Browser retrieval now uses the latest topic first with the same bounded referential fallback as server retrieval. These are size and contract results, not evidence of improved live answers.

November 2026 text-model switch. LFM3 ran with `--profile lfm3` and greedy decoding; Qwen3.5 4B ran at its production sampling and is the mean of 2 runs. All but the last row ran on the GPU:

| Setup | Actions | Chat | Harness | Holdout |
|---|---:|---:|---:|---:|
| Qwen3.5 4B, thinking off (previous production) | 84% | 84% | 54% | 95% |
| LFM3 1.7B Uncensored, Q6_K file | 77% | 72% | 59% | 93% |
| LFM3 1.7B Uncensored, Q8_0 re-encode | 79% | 69% | 56% | 93% |
| LFM3 1.7B Uncensored, Q8_0 re-encode on the VM | 81% | 63% | not run | 83% |

- Speed on the VM: plain turns show their first words after a median 3.7 seconds and turns with tools after 8 to 10.5 seconds, most of it thinking; Qwen took about 4 seconds on every turn but prefilled long prompts at a third of the speed. The first request after a restart reads the whole cached prefix, which takes 15 to 25 seconds for the tools prefix.
- A 96-token tools budget scored 4 to 5 cases lower than 128 on both files. With thinking off, LFM3 passed 21 of 53 action cases.
- LFM3's misses: it acts on some must-not-call messages (quoted requests, "not now", admin pages), and it writes code when asked despite the rule, which the route strips and leaves a dangling sentence. On one referential follow-up it repeats its draft after `</think>`; the route drops the draft, but the turn takes twice as long.
- Tightening: 4 or 5 facts per turn instead of 6 lost a multi-part answer, and rules shortened by about 45 tokens scored the same in total but lost three chat cases. Warm turns are dominated by thinking tokens, not prompt size, so the longer rules stay.

October 2026 historical results, predating the current prompts/case set (quality on a GPU with 2 repeats at each model's sampling; speed and time to first visible token on the VM):

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
3. A forced topic fact comes first: a single named project, PC-spec questions, or terminal-command questions. Other non-anchor facts are scored lexically by [factRanking.ts](../portfolio/lib/factRanking.ts): a curated tag phrase in the query scores its word count plus one (a trailing `s` also matches), and each query word found in the body of at most three facts scores one more. Facts under a third of the best score are dropped; next to a forced fact only strong matches (a tag or two specific words) stay. The query embedding only breaks ties. A question with no match gets anchors only.
4. Anchor facts fill the remaining slots (cloud models get eight facts in total). The Matrix puzzle fact is only eligible when the visitor asks about the puzzle.

Retrieval reads the latest message, so an earlier topic never hijacks a new question. The two earlier user turns join the query only when the latest message has no strong match and refers back (`it`, `that`, `more`, `why`), as in "how long did it take?". The on-device model uses the same lexical ranker. Keep tags specific: filler words such as `about`, `help`, or `talk` match unrelated questions. Tag edits need `EMBEDDINGS_MODE=local npm run build:embeddings` to refresh the bundle.

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