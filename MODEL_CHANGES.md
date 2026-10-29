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

**Blocker:** Transformers.js `latest` is 4.3.1 (checked 2026-10-29), which has no `lfm3` architecture. To enable:

1. In `portfolio/`, install `@huggingface/transformers@^4.3.2` once it is published.
2. Set `ON_DEVICE_CHAT_ENABLED = true`.
3. Smoke-test WebGPU with Playwright on a production build. Check load, generate, abort, clear cache, and the 16K-token limit.

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

**Pick: `bartowski/LFM3-1.7B-GGUF:IQ4_XS`.** It is the smallest, closest to the reference, and fastest at generation. Its only cost is 3–9% slower prompt processing than `Q4_K_M`. Mean KLD error bars were ±0.002–0.004.

The quantization-aware-distilled `QAD-Q4_0` may score lower on closeness than on actual task accuracy. It has no published task scores, though, and its prompt processing is about 30% slower.

## Decisions

- **Abliterated or uncensored builds:** not used. They remove refusals without improving reasoning, which is a reputational risk for a public in-character chat. No ONNX build exists either.
- **Speculative decoding:**
  - Transformers.js has no draft-model or prompt-lookup option.
  - LFM3 has no smaller model with the same tokenizer to act as a drafter. LFM2 uses a different vocabulary.
  - On a CPU, a drafter for a ~2B model rarely pays off.
  - Worth trying on the VM: llama.cpp n-gram or prompt-lookup speculation, which copies tokens from retrieved facts. Check `llama-server --help` on the deployed build.

## Next Steps

1. Enable on-device chat once Transformers.js 4.3.2 or later is published (see the steps above).
2. Optionally move the VM local agent (currently `gemma-4-e2b-phone`) to LFM3 with a llama.cpp `b11960`+ build:

   ```bash
   llama-server -hf bartowski/LFM3-1.7B-GGUF:IQ4_XS --jinja --temp 0.1 --top-k 50 --repeat-penalty 1.1
   ```

   Then set `upstreamModel` and `label` for `qwen-3.5-4b-local` in `portfolio/lib/chatModels.ts` and update the matching tests. The VM config is not in this repo.
3. Remove this file, or fold the relevant parts into `docs/ai-and-rag.md`, before merging.
