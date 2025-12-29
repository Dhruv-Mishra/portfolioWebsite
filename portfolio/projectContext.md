# Project Context: Dhruv's Sketchbook Portfolio

## 1. Project Overview
A **Fullscreen Sketchbook Portfolio** that blends a physical desk aesthetic with developer-centric tools. The user experience is "inside" a spiral-bound notebook where code meets creativity.

### Core Metaphor
-   **The "Paper"**: Textured background (Graph paper in Light Mode, Blackboard/Slate in Dark Mode) using CSS-based patterns.
-   **The "Tools"**:
    -   **Cursor**: Custom pencil/chalk SVG that leaves a fading trail (canvas-based).
    -   **Terminal**: A persistent, interactive command-line interface that acts as the primary power-user navigation.
    -   **Sticky Notes**: Specific yellow shades for project management aesthetics.

## 2. Technology Stack & Architecture
-   **Framework**: Next.js 16 (App Router) + Turbopack.
-   **Styling**: Tailwind CSS v4.
    -   **Config**: Zero-config `@theme` blocks in `app/globals.css`.
    -   **Theming**: `next-themes` (attribute="class") managing CSS variables (`--c-paper`, `--note-yellow`).
-   **State Management**: React Context (`TerminalContext`) for command history/output persistence.
-   **Animation**: `framer-motion` for page transitions, doodle parallax, and UI interactions.
-   **Deployment**: Static Export compatible (for low-resource environments).

## 3. Key Components & Implementation Details

### A. Layout System (`SketchbookLayout.tsx`)
-   **Responsive**: Uses `h-[100dvh]` (Dynamic Viewport Height) to solve mobile browser scroll issues.
-   **Structure**: Spiral binding (CSS/SVG) fixed to the left + Main "Paper" area.
-   **Parallax**: `framer-motion` mapped to mouse position (dampened springs) for subtle depth.
-   **Mobile**: Optimized to ensure full scrollability of content while keeping decorations subtle.

### B. Theming & Aesthetics
-   **Light Mode**:
    -   Bg: `#fdfbf7` (Warm Paper).
    -   Ink: `#2d2a2e` (Dark Charcoal).
    -   Notes: `#fff9c4` (Post-it Yellow).
    -   Text Contrast: High-performance highlights forced to `#000000` via JS-driven inline styles for maximum readability.
-   **Dark Mode**:
    -   Bg: `#1a1a1a` (Matte Black/Slate).
    -   Ink: `#e5e5e5` (Chalk White).
    -   Notes: `#222222` (Dark Cardstock).
    -   Text Contrast: Forced to `#ffffff`.
-   **Toggle Logic**: `ThemeToggle.tsx` uses `resolvedTheme` to handle "System" preference correctly without icon mismatch.

### C. Persistent Terminal (`TerminalContext.tsx`)
-   **Global State**: History and Output persist across page navigation.
-   **Commands**: `help`, `about`, `projects`, `resume`, `clear`.
-   **Mobile UX**: Auto-focus disabled on mobile to prevent virtual keyboard conflict during scrolling.

### D. Navigation
-   **Desktop**: Tabs on top-right, animated "hanging" effect.
-   **Mobile**: Tabs centered, lowered significantly (`y: -5px` active) to ensure touch targets are fully visible and not cut off by the browser chrome.

### E. Pages
-   **Home**: Intro + Terminal.
    -   **Credits**: "Dhruv" links to LinkedIn. Bio highlights "High-Performance Systems" at Microsoft.
-   **Projects**: Grid of Polaroid-style cards.
    -   **Interaction**: Random rotations, tape effects, handwritten descriptions.
    -   **Recent Fix**: Removed red margin lines for a cleaner look.
-   **Resume**:
    -   **Desktop**: Embedded PDF (`<object>`).
    -   **Mobile**: Clean "Download/Open" card to avoid unresponsive embed issues.

## 4. Best Practices & Rules
1.  **Mobile First**: Always test scroll behavior and touch targets. Use `100dvh` for full-screen containers.
2.  **Performance**:
    -   Use CSS variables for theming where possible.
    -   Use `transition-none` for critical contrast elements to prevent "ghosting" during theme switches.
    -   Keep bundle size low (removed unused libs, static export).
3.  **Aesthetics**:
    -   **Imperfection**: Use slight rotations (`rotate-1`, `-rotate-2`) and handwritten fonts (`Patrick Hand`) to avoid "corporate" stiffness.
    -   **Contrast**: Ensure text is readable on distinct note backgrounds.

## 5. Recent Refinements (Debugging Log)
-   **Theme Toggle Bug**: Fixed by using `resolvedTheme` instead of `theme`.
-   **Mobile Scroll**: Fixed by switching `h-screen` (which ignores browser chrome) to `h-[100dvh]` + `overflow-y-auto`.
-   **Contrast**: Enforced pure black/white text for bio highlights using inline JS styles to bypass CSS specificity issues.
-   **Assets**: Updated Bloom Filter project link to official repository.

## 6. Future Roadmap
-   [ ] **Sound Effects**: Audio feedback for typing/drawing.
-   [ ] **Project Details**: Expand card into full case study page.
-   [ ] **Blog/Notebook**: A section for markdown articles rendered as "handwritten" journal entries.
