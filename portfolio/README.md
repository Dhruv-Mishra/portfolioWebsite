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
| `npm run tts:smoke` | Load local Kokoro TTS and write `tmp/local-tts-smoke.wav` |
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
- Local TTS lives at `/api/tts` and runs Kokoro ONNX through `kokoro-js` + native `onnxruntime-node` on the Node runtime.
- Default low-latency CPU settings for the 4 ARM vCPU Oracle VM are `LOCAL_TTS_DTYPE=q4`, `LOCAL_TTS_DEVICE=cpu`, `LOCAL_TTS_INTRA_OP_THREADS=1`, `LOCAL_TTS_INTER_OP_THREADS=1`, `LOCAL_TTS_CONCURRENCY=1`, and `LOCAL_TTS_OPTIMIZED_LOADER=0`.
- `/api/tts` returns 24 kHz mono PCM16 WAV by default. Streaming mode uses same-origin REST POST with `Accept: application/x-ndjson` or `{ "stream": true }`, emitting base64 `pcm_s16le` chunks.
- For production nginx, disable buffering on `/api/tts` just like `/api/chat`: `proxy_buffering off; proxy_cache off; proxy_read_timeout 120s;`.
