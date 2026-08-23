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

### Changed

- Voice runtime now loads lazily on enter.
- Tooltips now use CSS.
- Hidden routes now return HTTP 404.
- Voice toggle is quieter and shorter; ambient audio ducks under speech.
- Voice welcome stays at most two sentences.
- Voice fact lookup omits always-on anchors.
- JSON-LD and settings Open Graph metadata.
- Dockerfile pip cache.

### Fixed

- Navigation `aria-current` is on the `Link`.
- `not-found` and `error` no longer depend on Framer Motion.

### Security

- Cookie-gated HTML is not served from the nginx `location /` cache.
