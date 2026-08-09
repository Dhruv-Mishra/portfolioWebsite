# API

These endpoints serve the portfolio UI. They are not a versioned third-party API. This guide intentionally excludes private, administrative, diagnostic, and gated endpoints.

## Browser-Facing Endpoints

| Method and path | Purpose | Notes |
|---|---|---|
| `POST /api/chat` | Generate a grounded chat reply | Accepts `messages`, an optional allowlisted `model`, and an optional JPEG, PNG, or WebP data URL under 180 KiB decoded. Replies include text, a signed assistant message, and optional validated UI action data. |
| `POST /api/chat/suggestions` | Generate two follow-up prompts | Accepts recent user/assistant messages and returns `{ "suggestions": string[] }`; failure returns an empty list. |
| `GET /api/tts` | Read local TTS status | Returns queue, public settings, and voice revision when the active TTS role is local. |
| `POST /api/tts` | Synthesize speech | Requires `text`. Normal responses are WAV; set `stream: true`, `?stream=1`, or `Accept: application/x-ndjson` for chunked PCM frames. |
| `GET /api/guestbook` | Read approved guestbook entries | Returns approved entries from the configured GitHub repository. |
| `POST /api/guestbook` | Submit a guestbook entry | Accepts a name and message; submission creates a pending GitHub Issue when configured. |
| `POST /api/feedback` | Submit website feedback | Accepts `bug`, `idea`, `kudos`, or `other`, plus a message and optional contact/page metadata. |

`POST /api/chat` accepts an omitted model as the default selection. Unsupported model identifiers, oversized request bodies, invalid image types, and images sent to text-only models are rejected. See [AI and RAG](ai-and-rag.md) for the current allowlist.

## TTS Streaming

The streaming TTS response is newline-delimited JSON. It begins with a `ready` frame, emits one or more `chunk` frames containing PCM16 audio data, and finishes with `done`. The ready frame identifies the sample rate and voice revision. The normal response is `audio/wav`.

The active public TTS path can be served by a different internal node than the app process. Clients should use the same-origin endpoint, not a gateway address. See [TTS](tts.md).

## Request Controls

- State-changing browser routes validate the configured site origin. TTS `POST` requires an explicit allowed `Origin` header.
- Nginx applies request limiting to API paths. The application adds in-memory, per-IP limits: chat is 20 per 5 minutes, suggestions 10 per 5 minutes, TTS 24 per minute, guestbook 3 per 10 minutes, and feedback 3 per hour.
- Application limits are in-memory sliding windows per Node process. They are not a distributed quota service, so multi-node protection also depends on the reverse proxy and edge configuration.
- The Nginx template restores visitor IPs only from configured Cloudflare address ranges. Keep that list current when maintaining the proxy.

## Error Handling

The routes use standard HTTP errors for invalid requests, origin failures, rate limits, unavailable dependencies, and internal failures. Rate-limit responses include `Retry-After`. Chat provider failures return a marked degraded static reply instead of silently changing to a different selected model.

## Documentation Map

| Guide | Use it for |
|---|---|
| [Architecture](architecture.md) | Runtime boundaries and request flow |
| [API](api.md) | Browser-facing endpoint contracts and controls |
| [AI and RAG](ai-and-rag.md) | Model selection, retrieval, and server configuration |
| [TTS](tts.md) | Pocket TTS behavior and gateway operations |
| [Deployment](deployment.md) | Promotion, container delivery, rollback, and operator checks |