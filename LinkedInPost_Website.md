# Website Update Draft

I have been tightening the engineering behind my portfolio site, not just the front-end presentation.

The chat experience is grounded in a Markdown fact corpus with a committed embeddings bundle. The default chat selection uses Groq Qwen when its server-side configuration is present, while an optional OpenAI-compatible local agent can be selected when the separate self-hosted endpoint is configured. NVIDIA-hosted models remain selectable through the same server-side allowlist.

For voice, custom speech runs through Pocket TTS in a Python worker. The deployment supports one local TTS gateway role and remote application nodes that forward only TTS traffic over the private network. The browser can still fall back to device speech when custom voice is unavailable.

The delivery path is also deliberately boring: CI runs linting, type checks, and tests, then publishes a multi-architecture container image. Changes promote through staging before production, production uses environment approvals, and the deploy path validates host contracts, health checks releases, and can roll back retained versions.

On the request boundary, the site validates allowed origins, bounds request payloads, and applies Nginx plus in-process IP rate limits. The in-process limits are per Node process, so they complement rather than replace edge and reverse-proxy controls.

It is a small personal site, but it has become a useful place to practice the operational parts of AI features: model selection, retrieval, voice serving, container delivery, and failure handling.