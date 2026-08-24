# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The app version remains `0.30.0`. The notes below describe the current
unreleased branch, not a new version bump.

This branch is post-hydrate, voice, and infra work. It does not claim a new
LCP. Last measured production LCP was about 393 ms with CLS 0 (August 2026).

## [Unreleased]

### Added

- Pull-request CI with lint, typecheck, test, and production build.
- Nginx `private, no-store` cache bypass for `/admin` and `/matrix-notes`.
- Voice HUD and agent state-machine documentation.
- 1200x630 Open Graph image.
- CSS-only page-turn destination skeleton while the next route is still pending.

### Changed

- Nav tabs now follow the pending page-turn destination instead of waiting for `usePathname()`.
- Reduced-motion and immersion-off navigations keep a destination snapshot until the route lands or the 5s watchdog fires.
- Voice runtime now loads lazily on enter.
- Tooltips now use CSS.
- Hidden routes now return HTTP 404.
- Voice toggle is quieter and shorter; ambient audio ducks under speech (~0.12 idle / 0.04 ducked, quieter on coarse pointers).
- Denied microphone still connects: the agent asks for access, waits 10s, then hangs up after a spoken timeout. A late grant sends the withheld welcome without reminting.
- Voice welcome stays at most two sentences.
- Voice fact lookup omits always-on anchors.
- JSON-LD and settings Open Graph metadata.
- Dockerfile pip cache.

### Fixed

- Navigation `aria-current` is on the `Link`.
- `not-found` and `error` no longer depend on Framer Motion.
- Voice enter cue plays on the click stack; HTMLAudio fades clamp to `[0, 1]`.
- Voice veil fades with CSS; Settings Always animate overrides OS reduced-motion.
- Voice enter/exit FLIP no longer restarts on listen/speak phase flips; intro-to-live veil uses an opacity transition instead of swapping animation names.
- Voice listen/speak no longer toggles on inter-chunk playback gaps: capture stays muted for a 320ms hangover, and Gemini `generationComplete` / user-transcript deltas no longer flip the HUD to listening.
- `/projects` shows the portfolio spinner instead of a blank pane.
- Voice utterance chains keep successful prefixes instead of dropping them on an unknown later clause.
- Voice ambient no longer restarts when prefetch calls `.load()`.
- Voice enter and exit use distinct Mixkit cues.
- Staging/CI skip unused onnxruntime-node CUDA NuGet download.
- fillField no longer requires document when window-only.
- Embeddings metadata matches voice-mode fact copy.

### Security

- Cookie-gated HTML is not served from the nginx `location /` cache.
