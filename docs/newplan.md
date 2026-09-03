# Website Performance Optimization & Architectural Simplification Plan

A comprehensive architectural audit and simplification plan for Dhruv's Sketchbook Next.js portfolio website. The core philosophy is **performance through simplicity**: removing speculative indirection, decoupling bloated god-files into cohesive modules, replacing heavy JavaScript animation dependencies in global layout chrome with pure CSS, eliminating micro-chunk hydration chains, and fixing standalone build tracing.

---

## Key Audit Findings & Problem Areas

1. **Dynamic Filesystem Project Tracing in Standalone Build**:
   - `lib/localTts.server.ts` line 202 uses `path.resolve(process.cwd(), configuredPath)`. Turbopack emits a high-severity warning during `next build`:
     > *Warning: Dynamic filesystem access causes tracing of the whole project... This is usually unintentional and leads to all source files (including the public folder) to be deployed as part of the server code.*
   - This inflates the standalone Docker deployment artifact on the 1GB RAM Oracle VMs by pulling the entire workspace into `.next/standalone/`.

2. **Hydration Chaining & Micro-Chunk Fragmentation in `EagerEnhancements` & `DeferredEnhancements`**:
   - `EagerEnhancements.tsx` wraps 8 tiny zero-DOM listeners/controllers in individual `dynamic(() => import(...), { ssr: false, loading: () => null })` calls (`VisitedPagesTrackerMount`, `SoundRouteListener`, `ClickSoundListener`, `AdminPrefsController`, `ExperimentalFeaturesController`, etc.).
   - Each dynamic import creates a separate <1KB chunk and adds an asynchronous React lazy boundary that defers hydration until network chunks download one-by-one.
   - `DeferredEnhancements.tsx` contains `SketchbookCursorLoader`, which is a dynamic import with `ssr: false` of `SketchbookCursor` inside `DeferredEnhancements` which is *already* dynamically imported with `ssr: false` (double indirection).
   - `DeferredEnhancements.tsx` also re-runs its multi-stage setTimeout ladder on *every* route change (`[pathname]` in `useEffect` deps), resetting timers repeatedly.

3. **Framer Motion Overhead in Global Chrome & Mobile Controls**:
   - `SoundToggleButton.tsx` imports `AnimatePresence, m` from `framer-motion` solely to fade in a vertical volume slider popover. Because it sits in `SketchbookLayout`, Framer Motion is bundled into the initial graph of every single page.
   - `GlobalVoiceFab.tsx` uses `<m.button>` on mobile with `whileHover` and spring transitions, even though mobile touchscreens don't have hover.
   - `MobileSoundToggleFab.tsx` also uses `m.button` and `AnimatePresence`.
   - In `ExperienceTimeline.tsx`, `DETAIL_VARIANTS` animates `height: 'auto'` using Framer Motion, triggering continuous JavaScript RAF measurement loops and layout thrashing.

4. **Global CSS Bloat & Duplicate Rules (106KB uncompressed, 236KB compiled on every page)**:
   - `globals.css` is 2,801 lines.
   - Multiple SVG data URIs with 3-octave `feTurbulence` filters run over the full viewport at 1.5% - 3% opacity (`PAPER_NOISE_SVG`), forcing browser rasterization engines on low-power devices to compute procedural Perlin noise every paint.
   - Redundant keyframes and duplicate selector blocks inflate the CSS payload loaded on every route.

5. **Monolithic God-Files with Mixed Concerns**:
   - `StickyNoteChat.tsx` (2,419 lines / 104KB) contains 12 separate components and hooks in a single file: `TypingEllipsis`, `useTypewriter`, `usePlaceholderTypewriter`, `SuggestionStrip`, `MatrixEscapeChip`, `MatrixAwareAssistantText`, `SpeakResponseButton`, `SpeakControlsTray`, `StickyNote`, `RateLimitNote`, `ServiceErrorNote`, `ConfirmContent`, `ChatInputArea` (536 lines), and `StickyNoteChat` (857 lines).
   - `useStickers.ts` (1,229 lines / 45KB) manages stickers, master volume, category volumes, mute state, matrix state, terminal commands, visited routes, opened projects, toast queues, and disco state in one place.

6. **Network Flooding on First User Gesture in `soundManager.ts`**:
   - `soundManager.primeOnGesture()` kicks off 14 parallel HTTP requests for MP3 files (8 in the first wave, 6 more 500ms later) immediately after the user first touches the screen.
   - Since procedural Web Audio synthesis is already implemented for every sound as fallback, downloading 14 MP3 files at once creates unnecessary bandwidth contention.

7. **Next.js 16 Deprecation Warning**:
   - `middleware.ts` is deprecated in Next.js 16 in favor of `proxy.ts`.

---

## User Review Required

> [!NOTE]
> All optimizations are designed to preserve 100% of the existing sketchbook aesthetic, sound feedback, disco mode, matrix puzzle, stickers, and mobile responsiveness. All 970 existing automated tests will continue to pass.

> [!IMPORTANT]
> **Zero Breaking Changes to Public Contracts**:
> - `useStickers.ts` will preserve its exact public export signatures (`useStickers`, `useSoundsMuted`, `useMasterVolume`, etc.) while internally delegating audio preferences to a dedicated module.
> - CSS selectors tested by contract tests (`motionPreferenceContract.test.ts`, `discoTheme.css.test.ts`) will be strictly preserved.

---

## Proposed Changes

### Phase 1: Build & Standalone Footprint Optimization

#### [MODIFY] [localTts.server.ts](file:///d:/Desktop/dhruvwebsite/portfolio/lib/localTts.server.ts)
- Fix the dynamic `path.resolve(process.cwd(), configuredPath)` on line 202.
- Scope path resolution to subfolder or apply Turbopack ignore annotation so Turbopack does not trace the entire project workspace into the standalone deployment bundle.

#### [MODIFY] [middleware.ts](file:///d:/Desktop/dhruvwebsite/portfolio/middleware.ts) -> [proxy.ts](file:///d:/Desktop/dhruvwebsite/portfolio/proxy.ts)
- Rename/migrate `middleware.ts` to `proxy.ts` (the canonical Next.js 16 convention) to resolve the deprecation warning.

---

### Phase 2: Runtime Hydration & Component Simplification

#### [MODIFY] [EagerEnhancements.tsx](file:///d:/Desktop/dhruvwebsite/portfolio/components/EagerEnhancements.tsx)
- Remove separate `dynamic(() => import(...), { ssr: false })` wrappers for zero-DOM headless listeners:
  - Consolidate headless listeners (`SoundRouteListener`, `ClickSoundListener`, `AdminPrefsController`, `ExperimentalFeaturesController`, `VisitedPagesTrackerMount`) into direct imports or a unified `SiteLifecycleListeners` client component.
  - Keeps heavy interactive overlays (`CommandPaletteProvider`, `ShortcutsOverlayProvider`, `DesktopContextMenu`) code-split, but eliminates 6 micro-chunk roundtrips on cold page load.

#### [MODIFY] [DeferredEnhancements.tsx](file:///d:/Desktop/dhruvwebsite/portfolio/components/DeferredEnhancements.tsx)
- Eliminate double dynamic import by directly referencing `SketchbookCursor` with `ssr: false`.
- Prevent pathname changes from cancelling and re-running the initial mount stage ladder once already mounted.

#### [DELETE] [SketchbookCursorLoader.tsx](file:///d:/Desktop/dhruvwebsite/portfolio/components/SketchbookCursorLoader.tsx)
- Remove this redundant 12-line wrapper file.

---

### Phase 3: Framer Motion Reduction in Core Layout Chrome

#### [MODIFY] [SoundToggleButton.tsx](file:///d:/Desktop/dhruvwebsite/portfolio/components/SoundToggleButton.tsx)
- Replace Framer Motion `m.div` and `AnimatePresence` on the master volume popover with lightweight CSS transitions (`opacity`, `transform`).
- Eliminates Framer Motion from the root layout desktop chrome.

#### [MODIFY] [MobileSoundToggleFab.tsx](file:///d:/Desktop/dhruvwebsite/portfolio/components/MobileSoundToggleFab.tsx)
- Replace `m.button` and `AnimatePresence` with standard button and CSS transitions.
- Eliminates Framer Motion from the root layout mobile chrome.

#### [MODIFY] [GlobalVoiceFab.tsx](file:///d:/Desktop/dhruvwebsite/portfolio/components/voice/GlobalVoiceFab.tsx)
- Replace `<m.button>` on mobile with standard `<button>` and active/tap CSS states.

#### [MODIFY] [ExperienceTimeline.tsx](file:///d:/Desktop/dhruvwebsite/portfolio/components/ExperienceTimeline.tsx)
- Replace Framer Motion `height: 'auto'` accordion animation with CSS grid-template-rows expansion (`grid-template-rows: 0fr -> 1fr`) or CSS transition.
- Eliminates continuous JavaScript layout recalculation loops during expand/collapse.

---

### Phase 4: CSS Optimization & Performance

#### [MODIFY] [globals.css](file:///d:/Desktop/dhruvwebsite/portfolio/app/globals.css)
- Consolidate duplicated motion-reduction rules (lines 2600-2666 vs 2668-2735) while preserving required contract selectors.
- Optimize the `PAPER_NOISE_SVG` background filter to prevent unnecessary heavy GPU/CPU rasterization on low-spec VMs.
- Remove redundant keyframes and unneeded style rules.

---

### Phase 5: Architecture Deconstruction of Monolithic God-Files

#### [NEW] `components/chat/`
- Extract distinct subcomponents from `StickyNoteChat.tsx`:
  - `components/chat/StickyNote.tsx`: Individual note card rendering, user/ai styling, pin/tape, action links.
  - `components/chat/ChatInputArea.tsx`: Composer input, image attachment preview, mic button, send button.
  - `components/chat/ChatSuggestions.tsx`: Suggestion strips, matrix escape chip, action chips.
  - `components/chat/ChatVoiceControls.tsx`: Speech response controls, audio playback speed.
  - `components/chat/useTypewriter.ts`: Extracted typewriter text effect.

#### [MODIFY] [StickyNoteChat.tsx](file:///d:/Desktop/dhruvwebsite/portfolio/components/StickyNoteChat.tsx)
- Refactor into a clean, readable orchestrator (~300 lines) that imports the focused subcomponents.

#### [NEW] [lib/audioPreferences.ts](file:///d:/Desktop/dhruvwebsite/portfolio/lib/audioPreferences.ts)
- Extract audio preferences state (master volume, mute flag, category volumes: sfx, tts, voice agent) from `useStickers.ts`.
- Expose hooks and imperative setters with exact compatibility.

#### [MODIFY] [useStickers.ts](file:///d:/Desktop/dhruvwebsite/portfolio/hooks/useStickers.ts)
- Focus purely on sticker game mechanics (unlocks, progress, album, toast queue).
- Re-export audio preferences so existing consumers continue working seamlessly.

---

### Phase 6: Audio Preload Network Optimization

#### [MODIFY] [soundManager.ts](file:///d:/Desktop/dhruvwebsite/portfolio/lib/soundManager.ts)
- Reduce the immediate parallel audio fetches on first gesture:
  - Preload only the immediate cues (`button-click`, `page-flip`).
  - Lazy-load subsequent sound assets on demand when `play()` is called or when the specific UI component mounts.
  - Keep procedural audio fallbacks active so zero sound delay is perceived.

---

## Verification Plan

### Automated Tests
1. Run full canonical Vitest test suite:
   ```bash
   npm run test
   ```
   (Must pass all 115 test files and 970+ tests without regressions)
2. Run TypeScript type checking:
   ```bash
   npm run typecheck
   ```
3. Run ESLint:
   ```bash
   npm run lint
   ```
4. Run Next.js production build:
   ```bash
   powershell -Command "$env:SKIP_EMBEDDINGS_BUILD='1'; npm run build"
   ```
   (Verify Turbopack standalone tracing warning is eliminated)
5. Run bundle size analysis:
   ```bash
   node scripts/bundle-report.mjs
   ```
   (Compare First Load JS and CSS before and after changes)

### Manual Verification
1. Verify homepage interaction: terminal typing, sound playback, custom cursor trail, pass-a-note CTA.
2. Verify chat page: message sending, typewriter effect, suggestion strips, sound effects, voice input.
3. Verify mobile view: social bar, sound toggle FAB, mobile navigation, responsive layouts.
4. Verify disco mode (`disco` in terminal) and matrix mode (`sudo matrix yes`).
5. Verify light/dark theme toggling and motion preference responsiveness.
