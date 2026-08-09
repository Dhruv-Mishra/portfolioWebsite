# First Project Reveal: An End-to-End Portfolio

This is the first project where I have owned the whole path, not only the interface: sketchbook-style frontend, Next.js backend, browser speech input, Pocket TTS, grounded RAG chat, model selection, and the release pipeline.

The chat uses a Markdown fact corpus and committed embeddings bundle, with allowlisted Groq, NVIDIA, and optional local model paths. Voice input can use browser-native recognition or local Whisper in a Web Worker; custom output runs through a Pocket TTS Python worker. The parts I care about most are the boundaries: input limits, origin checks, signed assistant history, deterministic UI actions, and useful fallbacks when an upstream provider is unavailable.

I also own the review and delivery loop. The guestbook and feedback flow are GitHub-backed, so comments have a real moderation and follow-up path. GitHub Actions runs linting, TypeScript checks, and Vitest; it builds a multi-architecture container image, promotes through staging, and requires approval before production.

The infrastructure is deliberately built from free-tier building blocks: Linux VMs behind Cloudflare and Nginx, with a separate TTS gateway role where needed. That constraint made tradeoffs tangible: cache what is expensive, put limits at the request boundary, and design a useful fallback before reaching for more hardware.

It is still a personal portfolio, but building it end to end has been a practical way to learn where frontend polish meets backend tradeoffs, voice UX, AI reliability, CI/CD, and release review.