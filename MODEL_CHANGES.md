# Model Changes (work in progress)

Branch: `feat/on-device-lfm3`. Hand-off notes for continuing on another machine.

## Uncommitted Work Captured Here

**On-device chat (LFM3 1.7B in the browser), still gated off**

- `on-device` entry in `portfolio/lib/chatModels.ts` (provider `browser`). Hidden from the picker and rejected as a saved preference while `ON_DEVICE_CHAT_ENABLED = false`.
- `portfolio/lib/browserChat{Client,Worker,Shared,Prompt}.ts`: a Transformers.js text-generation pipeline in a Web Worker on WebGPU. It loads `q4f16` weights from a pinned Hugging Face revision, supports abort, and can clear the cached model.
- `portfolio/app/chat/facts/` is a static facts corpus. The browser ranks it locally (anchor facts plus tag and text matches; 3 facts and 6 history turns per prompt).
- Shared prompt blocks were moved into `portfolio/lib/chatPromptBlocks.ts` so the server and browser prompts match.
- `/api/chat` rejects the browser model. Runtime catalogs and model status exclude it. Suggestions are skipped for on-device chats so the conversation never leaves the device.
- Settings checks WebGPU and `shader-f16` support, asks for consent, shows download progress, and can delete the cached model. `ModelPicker` lists only selectable models and adds an "On device" group when enabled.
- Tests: `browserChatPrompt.test.ts` plus updated catalog, route, provider, and settings tests. `npm run typecheck` and the full Vitest suite (1026 tests) pass.

**Remaining step:** Transformers.js 4.3.2 (which adds `lfm3`) is now in the lockfile. To enable:

1. Set `ON_DEVICE_CHAT_ENABLED = true`.
2. Smoke-test WebGPU with Playwright on a production build. Check load, generate, abort, clear cache, and the 16K-token limit.

## Browser Model Swap (ONNX)

Transformers.js loads only ONNX, so GGUF cannot be used in the browser.

| | Before | After |
|---|---|---|
| Repo | `onnx-community/LFM3-1.7B-ONNX` | `daveycodez/LFM3-1.7B-Web` |
| Revision | `ab9fec4c…` | `3c75909fbf17af6f734263e9cee75625bcfd7523` |
| `q4f16` weights | 1,088 MB | 900 MB |
| Top-1 agreement with fp16 | 81.0% | 89.1% |
| KL divergence from fp16 | 0.153 | 0.083 |
| Direct tool calls (20 prompts) | 13 | 20 |
| Max sequence length | 262,144 | 16,384 |

The quality and size figures come from the build's model card and were not measured here.

**What the build changes:** GPTQ re-quantization with symmetric 4-bit blocks of 32, so the fused WebGPU kernels apply. It also trims the vocabulary to about 49K tokens, removes the duplicate embedding copy at load, and uses flash attention for the sliding-window layers. The model card reports lower peak GPU memory and prompt processing about 5% faster.

**Trade-offs:**

- Non-English text needs more tokens.
- The 16K limit is fine because prompts are small.
- It is an unofficial build uploaded 2026-10-29. It is pinned to a commit for that reason.

**Rejected:**

- LiquidAI's official ONNX: `q4f16` is 1.3 GB.
- The onnx-community `q4`: 1.24 GB and not fp16.

## Server Quant Benchmark (GGUF, llama.cpp)

**Setup:**

- llama.cpp `b11982`, CPU build. LFM3 needs `b11960` or newer; the local winget install is `b11946`, which is too old.
- Text: the concatenated `portfolio/content/facts/**/*.md` corpus, `-c 512`, 16 chunks.
- Reference: LiquidAI `Q8_0`, which is not the full-precision model.
- CPU: AMD Threadripper PRO 5955WX. Absolute speeds on the VM will differ.

| Quant | Size | Mean KLD ↓ | 99% KLD ↓ | Same top token ↑ | Prompt t/s (16 / 4 threads) | Generation t/s (16 / 4 threads) |
|---|---|---|---|---|---|---|
| **bartowski `IQ4_XS`** | **951 MB** | **0.100** | **0.672** | **84.3%** | 539 / 194 | **59.5 / 38.9** |
| LiquidAI `Q4_K_M` | 1,049 MB | 0.127 | 0.939 | 82.8% | **558 / 213** | 54.8 / 35.8 |
| Pollard `IQ4_XS` | 1,023 MB | 0.166 | 1.078 | 80.5% | 548 / 202 | 53.9 / 34.3 |
| LiquidAI `QAD-Q4_0` | 1,001 MB | 0.169 | 1.296 | 81.4% | 394 / 142 | 57.0 / 38.0 |
| `Q8_0` (reference) | 1,761 MB | – | – | – | 240 / 116 | 33.6 / 21.9 |

**Pick on x86: `bartowski/LFM3-1.7B-GGUF:IQ4_XS`.** It is the smallest, closest to the reference, and fastest at generation. Its only cost is 3–9% slower prompt processing than `Q4_K_M`. Mean KLD error bars were ±0.002–0.004.

The quantization-aware-distilled `QAD-Q4_0` may score lower on closeness than on actual task accuracy. It has no published task scores, though, and its prompt processing is about 30% slower.

## ARM VM Benchmark (deployed)

The x86 pick does not carry over to `ARM_Hunar` (4× Neoverse-N1, dotprod, no i8mm). There, Q4_0 and IQ4_NL get weight repacking, but IQ4_XS and the K-quants do not. Measurements used llama.cpp `b11982` built with `GGML_NATIVE=ON`, 4 threads, flash attention, `llama-bench` `pp512`/`tg128`. KLD was measured against bartowski `Q8_0` on the same facts corpus.

| Quant | Prompt t/s | Generation t/s | Mean KLD ↓ | Same top token ↑ |
|---|---|---|---|---|
| **LiquidAI `QAD-Q4_0`** | **133** | **28.5** | 0.178 | 79.8% |
| bartowski `Q4_0` | 117 | 27.5 | 0.180 | 79.3% |
| bartowski `IQ4_NL` | 88 (105 with KleidiAI) | 24.2 (25.5) | **0.063** | **87.6%** |
| LiquidAI `Q4_K_M` | 77 | 25.4 | 0.112 | 83.7% |
| bartowski `IQ4_XS` | 45 | 22.9 | 0.093 | 84.6% |

**Deployed: `QAD-Q4_0`**, chosen for speed. A KleidiAI build was slower on Q4_0 prompts (116 t/s), so the plain native build is used. IQ4_NL is the quality fallback if answers drift: it gave comparable answers on the four test prompts at about 25% higher latency.

Server findings:

- One slot gives the lowest mean latency. Prompt processing is CPU-bound, and 2 or 4 slots did not raise throughput.
- LFM3 is hybrid with a 256-token sliding window. Without `--swa-full`, llama.cpp can restore a checkpoint only if it sits at least 256 tokens before the shared prefix ends, so most multi-turn requests reprocessed everything. With `--swa-full` and the cache-friendly prompt layout in the chat route, the 845-token system prompt is reused on every warm request. That costs about 190 MB more RAM.
- N-gram speculation (`ngram-simple`, `ngram-mod`) had low acceptance and made decoding slower, so it is off.
- Request flow: Cloudflare → nginx → `llm-gateway` bounded queue → `llama-server`. Configs and the installer are in `portfolio/scripts/local-llm`; details are in `docs/ai-and-rag.md`.

## Decisions

- **Abliterated or uncensored builds:** not used. They remove refusals without improving reasoning, which is a reputational risk for a public in-character chat. No ONNX build exists either.
- **Speculative decoding:**
  - Transformers.js has no draft-model or prompt-lookup option.
  - LFM3 has no smaller model with the same tokenizer to act as a drafter. LFM2 uses a different vocabulary.
  - On a CPU, a drafter for a ~2B model rarely pays off.
  - llama.cpp n-gram speculation was tested on the VM and rejected (see above).

## Next Steps

1. Enable on-device chat once Transformers.js 4.3.2 or later is published (see the steps above).
2. Deploy the site so the chat route uses the cache-friendly local prompt layout. Until then, the VM still answers the old layout correctly, but the prompt cache rarely hits.
3. Remove this file, or fold the relevant parts into `docs/ai-and-rag.md`, before merging.
