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

- Physical sketchbook paper stocks (`Field Cream`, `Blueprint`, `Kraft Studio`, and `Sage Pad`) in Settings and the desktop context menu, each with light and dark custom-property palettes that yield cleanly to disco mode.
- Delegated 3D paper-perspective hover tilt (`rotateX` / `rotateY`) and cursor-tracked specular sheen across project notes, the home terminal, the About polaroid, unlocked stickers, and holographic achievement banners.
- Directional React 19 `<ViewTransition>` page-leaf turns across the main sketchbook tabs, anchored around the top navigation tabs and gated on reduced-motion preferences.
- AtomicChat's LFM3 1.7B Uncensored as a third local chat model, next to Qwen3.5 4B and LFM3 Omni 2B. Its Q6_K weights are served as Q8_0 from a clang llama.cpp build, which reads prompts 57% faster with no measurable quality loss, and it generates about 19 tokens/s against Qwen's 11. It always thinks briefly (up to 128 tokens when it has the site tools, 32 otherwise), takes per-turn notes as a system message after the visitor's message, and gets the site tools only when a message could be a request. On `toolbench` it scores about 79% on actions, 68% on chat and 90% on fresh-wording actions, against 84%, 84% and 95% for Qwen. Plain replies start after about 3.7 seconds and turns with tools after 8 to 10.
- Invoke (voice-controlled coding agents) project card, fact, chat routing, and repo link.
- Home hero names Dhruv Mishra and his role and links resume, projects, and email before the terminal.
- Per-page Open Graph image and Twitter card on every route; About `ProfilePage` JSON-LD.
- Pull-request CI with lint, typecheck, test, and production build.
- Nginx `private, no-store` cache bypass for `/admin` and `/matrix-notes`.
- Voice HUD and agent state-machine documentation.
- 1200x630 Open Graph image.
- CSS-only page-turn destination skeleton while the next route is still pending.

### Changed

- Split Voice Stage (`voice-stage.css`) and Disco (`disco.css`) rules out of `app/globals.css` into lazy component stylesheets, replaced per-component `useWebHaptics` instances with one lazy touch-gated `WebHaptics` singleton, deferred `lib/projects.tsx` on `/projects` until a project modal opens, and gated idle toast/achievement chunks on unlocked state (7 fewer initial requests on `/`, ~2.4 KB less gzipped render-blocking CSS).
- Experience timeline details on `/about` expand and collapse through CSS grid-row transitions instead of abrupt conditional mounts, and the `Sketch outlines` appearance preference now applies across dashed surfaces sitewide.
- Tightened home hero vertical spacing so the title, voice note, terminal, and side-by-side chat/guestbook sticky notes fit above the fold on 1440x900 desktop viewports.
- Self-hosted text chat now runs Qwen3.5 4B (a Q4_0 mix with Q8_0 embeddings, tuned for the Arm VM) instead of LFM3 1.7B. On the new `toolbench` tool-calling and grounded-chat benchmark it scores about 89% on tool calls and 94% on chat, against 36% and 78%; first words arrive after about 4 seconds instead of 1.6.
- The VM's text servers run from one `llm-server@` systemd template, one instance per model.
- The first waiting note in chat appears after half a second instead of seven.
- The local LLM gateway lists each upstream's configured model ids in order, so old aliases stay healthy after a model swap.
- Local chat answers are shorter and more direct: tighter persona rules, a per-turn length hint, and intent-based `max_tokens` caps for local models. Provider text is preserved when a token limit is reached.
- framer-motion 14, TypeScript 6, Vitest 5, Vite 8, and openai 7. lucide-react stays on 0.562: 1.x marks its `Icon` as a client component, so icons in server-rendered pages ship and hydrate as JS (about 3.5 KB gzipped per page), and its headline accessibility change (`aria-hidden` by default) is already in 0.562.
- Tailwind `dark:` utilities now follow the site theme toggle instead of the OS color-scheme setting.
- Look-and-feel values centralized in `lib/designTokens.ts` and `@theme` utilities; persisted preferences share `LocalPreference`; API routes share `readJsonObjectOrError`.
- CI and deploy checks share one setup action; staging model audits run once after rollout instead of on every host, and the duplicate per-host TTS synthesis is gone.
- `@zvec/zvec-grep` (380 MB dev dependency), its scripts, and its MCP entry removed.
- 32 source-text contract test files and redundant cases removed (1053 -> 828 behavioral tests), along with dead code and one-off scripts.
- Resume PDF, resume facts, experience timeline, About copy, project cards, chat replies, and terminal output updated to the October 2026 resume; generic marketing phrasing removed.
- Next.js 16.3.8 (high-severity cache-poisoning and SSRF advisories), patched sharp and source-map-js; production audit clean.
- Google Analytics DNS hints only render when GA is configured.
- CI jobs have explicit timeouts.
- Updated default Groq chat model to Qwen 3.8 27B (`qwen/qwen3.8-27b`).
- Voice agent uses stable `gemini-3.8-live`; voice tools declare `BLOCKING` to keep serial action turns.
- Next.js 16.3.6 (critical RCE advisories), React 19.3.0, in-range dependency updates; production audit clean.
- Homepage JS ~3% smaller (sticker roster, navigation paths, voice invocation, and project slugs split into leaf modules; doodles rendered on the server).
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

- Restored dark-mode contrast on the home `Hello World!` title, the `404` and `error` sticky-note pages, project card dog-ear corner folds, and `/about` timeline category chips.
- Removed mobile floating voice and volume button overlap over the home terminal and `/resume` PDF controls, and hid the collapsed mobile social drawer from the accessibility tree until expanded.
- Aligned accessible names with visible button/link labels on `HomeVoiceNote`, home `NoteCta` links, `StickerGlanceBadge`, and timeline triggers (WCAG 2.5.3; Lighthouse Accessibility/Best Practices/SEO/Agentic Browsing 100 across 52/52 checks), and removed duplicate nested `<main>` landmarks on `/admin` and `/matrix-notes`.
- Chat questions such as "how did you implement dark mode?" or "do you have a dark mode?" no longer switch the theme.
- A streamed chat reply is no longer erased and replaced with a canned fallback when the provider fails mid-stream; the text already shown becomes the reply.
- Portfolio project modal video: the file was misspelled `PersonalPorfolio.mp4`, so the derived `PersonalPortfolio.mp4` path 404'd.
- Removed dead code and unreferenced public files (`MatrixNotesGate`, an unused adapter export, unused CSS, `og-default.png`, a duplicate favicon, a stale public README).
- Client bundles no longer include the full `package.json`; only the version is exposed.
- Portfolio-project chat keywords escape `\s`, so "portfolio project" and "this site" match again.
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
