# AstroJS + Cloudflare Workers Migration Feasibility Report

Date: 2026-06-13

## Executive Decision

Moving Dhruv's Sketchbook from Next.js to Astro is feasible and worth a focused proof of concept, but the right reason is performance and architecture simplification, not SEO alone. The current site already has strong SEO primitives: metadata, Open Graph/Twitter data, JSON-LD, sitemap entries, crawler-friendly markdown routes, and LLMS routes. Astro can improve the delivery quality of that content by making more of the public site static HTML and hydrating only the widgets that need browser state.

Deploying an Astro version to Cloudflare Workers is feasible for the static shell, static assets, React islands, and lightweight API routes. A pure Workers migration for the entire current feature set is not feasible without redesigning local TTS. The current TTS path starts a Python worker process and depends on VM-like filesystem/cache/native-library behavior, which does not map to Workers.

Recommended path: build an Astro-on-Workers prototype for the static public site first, preserve all SEO routes and metadata, keep `/api/tts` on the existing VM as a sidecar, and port chat/guestbook/feedback APIs only after Worker compatibility and bundle/startup limits are proven. Also run a small OpenNext-on-Workers spike if the main goal is Cloudflare hosting rather than moving to Astro.

## Research Method

This report combines three dedicated GPT-5.5 explorer passes plus direct local verification:

1. GPT-5.5 codebase explorer: inspected the current Next.js app structure, API routes, server modules, and deployment assumptions.
2. GPT-5.5 Astro explorer: reviewed current Astro migration, islands, React integration, content, SEO, image, endpoint, and rendering guidance.
3. GPT-5.5 Cloudflare Workers explorer: reviewed current Workers deployment, runtime, limits, static assets, Node compatibility, Python/Wasm, OpenNext, Workers AI, and Vectorize guidance.

The current repo was checked for API route count, Node-pinned route handlers, Next-specific helpers, local TTS internals, fact retrieval, GitHub-backed notes, sitemap behavior, and embeddings bundle size.

## Current Codebase Snapshot

The production app lives under [portfolio](portfolio). It is a Next.js 16 App Router app with React 19, TypeScript, Tailwind CSS 4, Framer Motion, Vitest, Groq/OpenAI chat, local TTS, markdown/fact content, and a standalone VM/Docker deployment behind Cloudflare and Nginx.

Key local evidence:

- [portfolio/package.json](portfolio/package.json) uses Next.js, React, Framer Motion, Groq, OpenAI, `@huggingface/transformers`, and scripts for embeddings plus local TTS smoke tests.
- [portfolio/next.config.ts](portfolio/next.config.ts) is tuned for `output: 'standalone'`, low-memory VMs, stable multi-origin build IDs, disabled Next image optimization, Cloudflare/Nginx compression, and inclusion of the Python TTS worker in the standalone bundle.
- [portfolio/app/layout.tsx](portfolio/app/layout.tsx) owns global metadata, Open Graph/Twitter cards, JSON-LD, local fonts through `next/font/local`, analytics, theme provider, navigation, sketchbook layout, and global client enhancements.
- [portfolio/app/sitemap.ts](portfolio/app/sitemap.ts) includes public pages plus `llms.txt`, `llms-full.txt`, and markdown routes such as `/index.md`, `/about.md`, `/projects.md`, and `/resume.md`.
- [portfolio/app/api](portfolio/app/api) contains 9 API route files: admin logout, admin unlock, chat, chat suggestions, feedback, guestbook, voice log, matrix notes, and TTS.
- The discovered API route files are currently Node-pinned with `export const runtime = 'nodejs'`, so Workers is not a drop-in deployment target.
- [portfolio/lib/localTts.server.ts](portfolio/lib/localTts.server.ts) imports `node:child_process`, `node:fs`, `node:os`, `node:path`, and `node:readline`, then spawns `scripts/kitten-tts-worker.py`.
- [portfolio/lib/factRetrieval.server.ts](portfolio/lib/factRetrieval.server.ts) imports the committed embeddings bundle and calls an OpenAI-compatible embeddings API at request time.
- [portfolio/lib/facts.embeddings.json](portfolio/lib/facts.embeddings.json) is currently about 265 KB, small enough to consider for Workers, but still worth measuring with the full Worker bundle.
- [portfolio/lib/notes.server.ts](portfolio/lib/notes.server.ts) uses GitHub Issues as the moderated datastore for guestbook and matrix notes.
- [portfolio/app/guestbook/page.tsx](portfolio/app/guestbook/page.tsx) is a server-rendered GitHub-backed page using `revalidate = 60`.

## Astro Feasibility

Astro is a strong fit for the public portfolio surface if the migration actually adopts Astro's static/content-first model. It is a weak fit if the current app is simply wrapped as one large hydrated React island.

What maps well:

- Static pages: home, about, resume, project summaries, stickers shell, markdown route surfaces, LLMS routes, sitemap, robots-style metadata, and structured data.
- Markdown and facts content: good candidates for Astro content collections with schemas.
- Existing React components: reusable through `@astrojs/react`, then gradually convertible to `.astro` where they do not require hooks, effects, or state.
- Deferred enhancements: map naturally to `client:idle`, `client:visible`, `client:media`, and occasional `client:only="react"`.
- Terminal, chat, guestbook form, project modals, and sticker interactions: can remain React islands scoped to the routes or page regions that need them.
- API routes: can be recreated as Astro server endpoints or Actions, using standard Web `Request` and `Response` objects.

Required migration work:

- Replace `next/link` with normal `<a>` links or a local Astro link component.
- Replace `next/image`; Astro `<Image />` works in `.astro`/MDX, while React islands need normal `<img>` or optimized image data passed from Astro.
- Replace `next/font/local` with explicit `@font-face`, Astro font handling, or a small local font abstraction.
- Replace `next/dynamic` with Astro hydration directives or dynamic imports inside React islands.
- Replace or isolate `next-themes`; a small first-paint-safe class/theme script is likely cheaper than carrying a global React provider.
- Convert Next metadata exports into explicit layout/page head rendering and helper functions.
- Translate `revalidate` and `next: { revalidate }` behavior into Cloudflare cache headers, static generation, or endpoint-level caching.
- Preserve current URL, sitemap, markdown/LLMS, canonical, Open Graph, Twitter, robots, and JSON-LD behavior exactly unless intentionally changed.

Expected Astro benefits:

- Less default client JavaScript on content pages.
- Lower React hydration cost on mobile.
- More explicit hydration boundaries for interactive features.
- Simpler content modeling and route generation as the site grows.
- Easier preservation of standard page navigation and crawlable content.

Expected Astro non-benefits:

- Astro will not automatically improve rankings if content, metadata, and crawlability are already good.
- Astro will not help if most of the existing UI remains a single `client:load` React app.
- Astro will not remove API, auth, chat, rate limiting, storage, or TTS runtime decisions.

## SEO Assessment

The current site is already SEO-aware. The likely SEO improvement from Astro is indirect: faster delivery, simpler HTML, less hydration, and easier content route management. It should not be sold as a missing-metadata fix.

SEO gains to expect if the migration is done well:

- More public content present in static HTML by default.
- Less JavaScript required before users and crawlers see meaningful content.
- Faster mobile interactivity from reduced hydration.
- Easier static generation of sitemap and markdown crawler surfaces.
- Better edge caching story when paired with Workers Static Assets.

SEO risks to actively prevent:

- Dropping `/llms.txt`, `/llms-full.txt`, `/index.md`, `/about.md`, `/projects.md`, or `/resume.md`.
- Changing canonical URLs, route casing, trailing slash behavior, titles, descriptions, or social images by accident.
- Losing JSON-LD, robots settings, or sitemap priorities/change frequencies.
- Making important content client-only inside a React island.
- Assuming Astro sitemap generation covers SSR dynamic routes automatically.
- Losing existing cache headers for HTML, resources, and long-lived assets.

Conclusion: migrate for performance, maintainability, and static/content architecture. Treat SEO parity as a hard acceptance gate.

## Cloudflare Workers Feasibility

Astro on Cloudflare Workers is a first-class deployment path through `@astrojs/cloudflare`. Current Astro docs state that the Cloudflare adapter targets Workers and that Cloudflare Pages support was removed in the adapter v13/Astro 6 path. Cloudflare also recommends Workers for new Astro projects.

What Workers handles well for this site:

- Static Astro HTML/CSS/JS/images deployed through Workers Static Assets.
- Static asset requests bypassing Worker execution by default.
- Worker-first routing only for selected paths like `/api/*`.
- Astro on-demand rendering and endpoints using Web APIs.
- Fetch-based calls to Groq, OpenAI-compatible providers, GitHub, and other HTTP services.
- Streaming/proxy responses where CPU work stays low and the client remains connected.
- Secrets and bindings through Wrangler/Cloudflare configuration.
- Cloudflare-native storage and AI options such as KV, D1, Durable Objects, R2, Workers AI, Vectorize, and AI Gateway.

Workers constraints that matter here:

- Memory is 128 MB per isolate.
- Worker compressed size is 3 MB on Free and 10 MB on Paid.
- Worker startup must complete within 1 second.
- Free plan CPU is 10 ms per request; Paid can be configured higher, up to 5 minutes.
- Free plan subrequests are 50 per invocation; Paid defaults are much higher.
- Each invocation has six simultaneous outgoing connections waiting for response headers.
- Environment variables and secrets have count and size limits.
- Node.js compatibility is partial. Some modules exist only as stubs.
- `node:child_process` is partially supported only as a non-functional stub.

This makes the static site and most fetch-based APIs plausible. It does not make Workers equivalent to the current Linux VM runtime.

## Feature-by-Feature Workers Assessment

| Feature | Workers feasibility | Notes |
| --- | --- | --- |
| Static pages and layouts | High | Best-fit target for Astro static generation and Workers Static Assets. |
| Navigation/theme shell | High | Replace Next helpers and hydrate only necessary state. |
| Terminal island | Medium-high | Mostly client-side, but terminal commands that call APIs need route review. |
| Chat UI | High | Can remain a React island and call either Worker or VM endpoint. |
| Chat API | Medium | Feasible if rewritten around Web APIs, Worker-safe crypto/rate limiting, and direct `fetch` or proven SDK compatibility. |
| RAG/fact retrieval | Medium | 265 KB embeddings bundle is okay today, but SDKs, global init, and future corpus growth need measurement. Vectorize is a future candidate. |
| Guestbook/matrix notes | Medium-high | GitHub Issues via `fetch` can work. Replace Node-specific crypto patterns where needed. |
| Admin unlock/logout | Medium-high | Astro supports cookies in on-demand routes; Next-specific `cookies()` and `notFound()` need equivalents. |
| Feedback/log endpoints | Medium-high | Likely straightforward if kept fetch/Web Crypto compatible. |
| Local TTS API | Low for pure Workers | Current implementation spawns Python and depends on local model/cache/native behavior. Keep on VM or replace provider. |
| Python Workers for TTS | Low-medium | Python Workers are open beta and not a drop-in path for current native/local KittenTTS. |
| Wasm TTS | Low | Theoretical only; memory, startup, single-threading, and experimental WASI make this high risk. |

## Main Blocker: Local TTS

[portfolio/lib/localTts.server.ts](portfolio/lib/localTts.server.ts) is the clearest hard blocker for a pure Workers migration. It discovers Python executables, sets process environment variables, configures CPU/threading behavior, uses local model/cache paths, and spawns `scripts/kitten-tts-worker.py` as a child process.

That model fits a VM or Docker container. It does not fit Workers. Cloudflare's Node compatibility does not provide functional child processes, and Python Workers do not turn a native Python TTS service into a safe drop-in edge workload.

Practical TTS options:

1. Keep local TTS on the existing VM and proxy to it from the Astro/Workers site.
2. Replace local TTS with a hosted TTS provider if voice/quality/cost are acceptable.
3. Use a dedicated TTS service and cache generated audio in R2 or the VM.
4. Explore Workers AI only if an acceptable TTS model exists for the product experience.
5. Treat Wasm TTS as research, not as the first migration path.

Recommendation: keep TTS on the VM for the first migration. Do not let TTS portability block the static shell and public route performance work.

## Architecture Options

| Option | Description | Feasibility | Risk | Recommendation |
| --- | --- | --- | --- | --- |
| A. Stay on Next.js VM | Continue current deployment and targeted optimizations. | High | Low | Safest, but misses Astro/Workers benefits. |
| B. Next.js on Workers via OpenNext | Keep Next.js and deploy through OpenNext. | Medium | Medium | Good spike if Cloudflare hosting is the main goal. TTS still blocked. |
| C. Astro on Workers + VM sidecar | Static site and lightweight APIs on Workers; TTS stays on VM. | High | Medium | Recommended first target. |
| D. Pure Astro on Workers | Entire site and APIs move to Workers; TTS replaced/redesigned. | Medium-low | High | Only after TTS and chat/RAG decisions. |

Recommended target architecture:

```text
Browser
  -> Cloudflare Workers Static Assets: Astro HTML/CSS/JS/images
  -> Worker routes for /api/chat, /api/guestbook, /api/feedback as they become compatible
  -> VM sidecar for /api/tts and any heavy native/runtime dependency
  -> External providers: Groq/OpenAI/GitHub/etc.
```

This hybrid path captures the likely public-page performance gains while keeping native local compute on infrastructure that matches it.

## OpenNext Alternative

OpenNext is a credible alternative if the main goal is Cloudflare edge hosting without changing frameworks. Current Cloudflare/OpenNext docs list support for Next.js 16, App Router, route handlers, SSR, SSG, ISR, streaming, server actions, middleware, Partial Prerendering, and image optimization through Cloudflare Images.

Pros:

- Much smaller rewrite than Astro.
- Keeps App Router and most current conventions.
- Useful way to test Cloudflare hosting benefits before a framework migration.

Cons:

- Does not reduce React/Next complexity as much as Astro.
- Does not remove as much client-side JavaScript on static pages.
- Still must satisfy Workers bundle, startup, CPU, memory, and runtime limits.
- Still cannot run current local TTS as-is.
- Windows support is not fully guaranteed by OpenNext, so serious preview/deploy testing should happen in CI, WSL, or Linux.

Recommendation: run an OpenNext spike only if the Cloudflare hosting question is more urgent than the Astro static-content question.

## Migration Plan

### Phase 0: Baseline and Route Contract

- Capture Lighthouse/WebPageTest/Core Web Vitals for home, about, projects, resume, chat, and guestbook.
- Measure current route-level JavaScript and hydration costs.
- Snapshot current route list, status codes, redirects, canonical URLs, headers, sitemap, robots, JSON-LD, Open Graph, Twitter metadata, markdown routes, and LLMS routes.
- Record current API contracts for chat, TTS, guestbook, feedback, admin, matrix notes, and voice logging.
- Decide whether the Astro prototype lives in a temporary sibling directory or inside [portfolio](portfolio) behind separate scripts.

Exit criteria:

- There is a baseline to prove whether the migration improves anything.

### Phase 1: Static Astro Prototype

- Create an isolated Astro app with TypeScript, Tailwind 4, `@astrojs/react`, `@astrojs/sitemap`, and later `@astrojs/cloudflare`.
- Copy public assets, global CSS variables, and font files.
- Rebuild root layout, head metadata, JSON-LD, navigation, and static page shell.
- Convert home, about, resume, project summaries, markdown/LLMS routes, and sitemap first.
- Keep heavy interactive widgets out unless needed for route parity.

Exit criteria:

- Static pages render visually close to current production.
- Important content exists in HTML without React hydration.
- SEO outputs match current behavior.
- Initial JS drops materially on content pages.

### Phase 2: Interactive Islands

- Port terminal, chat UI, guestbook form, project modals, stickers, command palette, shortcuts, cursor, and feedback controls as scoped React islands.
- Use `client:load` only for immediately necessary above-the-fold controls.
- Use `client:idle` for non-critical controls.
- Use `client:visible` for below-the-fold or heavy UI.
- Use `client:only="react"` only when server rendering is unsafe.
- Convert simple non-interactive React components to `.astro` after parity is stable.

Exit criteria:

- No hydration mismatch or layout shift from delayed islands.
- Keyboard, accessibility, and mobile interactions still work.
- Static routes still ship less JS than the current Next baseline.

### Phase 3: API Strategy

- Keep `/api/tts` on VM for the first production-grade migration.
- Decide whether `/api/chat` initially stays on VM or moves to Workers.
- If moving chat to Workers, prefer direct `fetch` provider calls unless Groq/OpenAI SDKs are proven small and Worker-compatible.
- Replace Node-specific crypto/rate-limit patterns with Workers-compatible equivalents where needed.
- Port GitHub-backed guestbook/matrix/feedback endpoints using Web APIs.
- Consider D1, Durable Objects, KV, R2, Workers AI, or Vectorize only when they solve a real bottleneck or replace an external/VM dependency.

Exit criteria:

- API contracts match current clients.
- Secrets are provisioned through Wrangler/Cloudflare safely.
- Worker bundle size, startup time, CPU, memory, subrequest, and connection limits are verified.
- Free vs Paid Workers plan assumptions are explicit.

### Phase 4: Workers Deployment

- Add `@astrojs/cloudflare` and Wrangler configuration.
- Configure static asset handling and `not_found_handling = "404-page"` unless an SPA fallback is explicitly needed.
- Use Worker-first routing only for dynamic/API paths.
- Add `_headers` and `_redirects` where static rules are enough.
- Deploy to a staging Workers subdomain first.
- Disable Cloudflare Auto Minify if it causes hydration mismatches.

Exit criteria:

- Static assets are served from Workers Static Assets.
- Dynamic routes invoke Worker code only where intended.
- Rollback to the current VM/Next deployment is simple.

### Phase 5: Cutover Validation

- Run route parity, metadata parity, sitemap parity, visual, accessibility, and mobile checks.
- Smoke test chat, guestbook, feedback, admin, matrix notes, and TTS.
- Compare Lighthouse/WebPageTest against Phase 0.
- Verify Search Console sitemap submission and analytics continuity.
- Keep old deployment available until real traffic metrics are healthy.

Exit criteria:

- Performance improves without route, SEO, or feature regressions.

## Performance Expectations

Expected gains:

- Lower JavaScript payload on content routes.
- Faster mobile Time to Interactive and lower main-thread hydration work.
- Better edge delivery for static assets.
- More predictable progressive hydration for non-critical widgets.
- Simpler mental model for content pages.

Non-guarantees:

- Workers will not improve responses dominated by external LLM latency unless caching/fallbacks improve.
- Astro will not improve LCP if image/font/layout work regresses.
- Keeping most UI as one large React island will erase much of Astro's advantage.
- A pure Workers architecture will not work until TTS is redesigned or moved off the critical path.

## Risk Register

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Local TTS cannot run on Workers | High | Keep TTS on VM or replace provider separately. |
| Route/SEO regression | High | Snapshot current metadata, sitemap, LLMS, markdown routes, status codes, and headers before rewriting. |
| Astro gains erased by large React island | High | Convert layout/content to Astro and hydrate only small widgets. |
| Worker bundle/startup limits | High | Dry-run Wrangler early; avoid large SDKs in Worker path; prefer direct `fetch` where practical. |
| Worker memory limit | Medium-high | Keep large data out of global init; move future large RAG data to Vectorize/R2/KV. |
| Chat provider latency unchanged | Medium | Keep current fallbacks/timeouts and evaluate caching or direct provider calls. |
| Image migration regressions | Medium | Use preoptimized assets or Astro/Cloudflare image handling deliberately. |
| Cookie/admin behavior drift | Medium | Add route-level tests for unlock/logout/status behavior. |
| Cloudflare plan mismatch | Medium | Decide Free vs Paid before API migration. |
| GitHub Issues datastore limits | Low-medium | Keep initially; move to D1/Durable Objects only if moderation workflow changes. |

## Effort Estimate

| Workstream | Estimate | Confidence |
| --- | ---: | --- |
| Static Astro shell prototype | 3-5 days | Medium |
| Public route, metadata, sitemap, markdown/LLMS parity | 1-2 weeks | Medium |
| React island migration for terminal/chat/stickers/guestbook | 1-3 weeks | Medium-low |
| Workers deployment for static shell | 1-3 days after Astro prototype | Medium |
| Workers port for guestbook/feedback/admin | 3-7 days | Medium |
| Workers port for chat/RAG | 3-10 days | Medium-low |
| VM sidecar/proxy for TTS | 1-2 days | Medium |
| Pure Workers TTS replacement | 2-6+ weeks | Low |

## Go / No-Go Criteria

Go if the spike proves:

- Home/about/resume/projects ship materially less JS.
- Route metadata and sitemap/LLMS outputs preserve current SEO behavior.
- The sketchbook visual identity survives without a global React shell.
- Workers deploy/preview passes bundle, startup, and runtime checks.
- TTS can remain behind a stable VM-backed endpoint without user-visible regression.

Pause or no-go if:

- Most of the site must remain a single `client:load` React app.
- Cloudflare Worker bundle/startup limits are hit by chat/runtime dependencies.
- TTS quality is mandatory and cannot stay on the VM or move to a provider.
- Route parity requires more rewrite than the expected performance gain justifies.

## Latest Sources Reviewed

Official Astro docs:

- https://docs.astro.build/en/guides/migrate-to-astro/from-nextjs/
- https://docs.astro.build/en/concepts/islands/
- https://docs.astro.build/en/guides/framework-components/
- https://docs.astro.build/en/reference/directives-reference/
- https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- https://docs.astro.build/en/guides/deploy/cloudflare/
- https://docs.astro.build/en/guides/on-demand-rendering/
- https://docs.astro.build/en/guides/endpoints/
- https://docs.astro.build/en/guides/content-collections/
- https://docs.astro.build/en/guides/images/
- https://docs.astro.build/en/guides/integrations-guide/sitemap/

Official Cloudflare and OpenNext docs:

- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- https://developers.cloudflare.com/workers/runtime-apis/webassembly/
- https://developers.cloudflare.com/workers/languages/python/
- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- https://opennext.js.org/cloudflare
- https://developers.cloudflare.com/workers-ai/
- https://developers.cloudflare.com/vectorize/

Migration and architecture articles:

- https://www.datocms.com/blog/why-we-switched-to-astro
- https://johnzanussi.com/posts/nextjs-to-astro-migration
- https://jasonformat.com/islands-architecture/

Notable source takeaways:

- Astro's official migration guide supports incremental migration from Next.js and reuse of React components.
- Astro framework components render static HTML by default and only hydrate with explicit `client:*` directives.
- Astro's Cloudflare adapter targets Workers in the current Astro 6/adapter v13 path.
- Workers Static Assets can serve matching files without invoking Worker code.
- Workers are not Linux VMs: child processes are non-functional stubs, memory is 128 MB, and bundle/startup limits matter.
- OpenNext is a credible alternative if Cloudflare hosting is desired without changing frameworks.
- Real-world migration articles consistently show Astro wins when the site is content-driven and React is removed or limited to true islands.

## Suggested Immediate Next Step

Build a short-lived Astro prototype for only the static public shell and one interactive island. Measure it against the current Next build before touching production code. The prototype should answer one question: can the sketchbook feel stay intact while the content routes become mostly static HTML with small, delayed islands? If yes, continue with the phased plan. If no, keep the current Next architecture and consider OpenNext or targeted hydration/caching improvements instead.