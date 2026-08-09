# TTS

Server custom voice uses Pocket TTS (`kyutai/pocket-tts`) through a persistent Python worker managed by the Next.js process. The worker produces 24 kHz PCM16 audio. The browser can instead use its device speech path; the server route remains the contract for custom voice output.

## Request Behavior

- `GET /api/tts` returns status, queue state, public settings, and the SHA-256 revision of the active reference audio.
- `POST /api/tts` accepts text, normalizes it for speech, and returns WAV by default.
- Streaming is requested by `stream: true`, `?stream=1`, or the NDJSON `Accept` header. It emits `ready`, `chunk`, and `done` frames, with optional adaptive gzip framing when the client explicitly supports it.
- One synthesis runs at a time. The default queue limit is four requests, and the default maximum input is 1,200 characters.

See [API](api.md) for the same-origin request contract and error responses.

## Gateway Topology

The deployment configuration supports two roles per site:

- `TTS_NODE_MODE=local` runs the Pocket TTS worker and stores its cache on that node.
- `TTS_NODE_MODE=remote` sends only `/api/tts` through Nginx to a configured private IPv4 gateway. The deploy script requires a shared backend token and validates the remote backend URL format.

The production and staging workflows assign one local TTS role before remote roles are deployed. Keep the gateway endpoint and token in VM configuration or GitHub secrets, never in application documentation or browser code.

## Runtime Configuration

| Setting | Operator use |
|---|---|
| `HF_TOKEN` | Read access for the gated initial model download on a local TTS node |
| `LOCAL_TTS_CACHE_DIR` | Persistent model and derived voice-state cache |
| `LOCAL_TTS_REFERENCE_PATH` | Reference audio path inside the runtime |
| `LOCAL_TTS_PYTHON` | Explicit Python interpreter, when required |
| `LOCAL_TTS_OFFLINE` or `HF_HUB_OFFLINE` | Cache-only mode after the model has been warmed |
| `LOCAL_TTS_MAX_QUEUE` | Queue bound, from 0 through 16 |
| `LOCAL_TTS_MAX_TEXT_CHARS` | Input bound, from 80 through 4,000 |

The Docker image installs Python and Pocket TTS, and mounts a persistent cache path at runtime. The voice revision is derived from the reference file bytes, so a new reference file changes the revision returned to clients.

## Operator Checks

1. Run `npm run tts:smoke` locally after installing the Python requirements and configuring gated-model access.
2. Confirm `GET /api/tts` through the same-origin site returns an available local TTS status and expected voice revision.
3. For a remote role, test only the public same-origin route. The private gateway address is an implementation detail.
4. Keep Nginx buffering disabled for `/api/tts`; buffered NDJSON delays speech playback until generation completes.

## Documentation Map

| Guide | Use it for |
|---|---|
| [Architecture](architecture.md) | Runtime boundaries and request flow |
| [API](api.md) | Browser-facing endpoint contracts and controls |
| [AI and RAG](ai-and-rag.md) | Model selection, retrieval, and server configuration |
| [TTS](tts.md) | Pocket TTS behavior and gateway operations |
| [Deployment](deployment.md) | Promotion, container delivery, rollback, and operator checks |