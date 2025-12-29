# Project Context: Dhruv's Sketchbook Portfolio

## 1. Project Overview
This is a developer portfolio website conceptualized as a **digital sketchbook**. The user interface mimics physical paper, drawing tools, and handwritten elements, providing a unique "desk" atmosphere.

### Core Metaphor
- **The "Page"**: The central content area is a sheet of textured paper (Graph paper in Light Mode, Blackboard in Dark Mode).
- **The "Tools"**: The cursor is a physical tool (Pencil or Chalk) that leaves a trail.
- **The "System"**: An integrated Terminal overlay provides a developer-centric navigation method alongside standard UI.

## 2. Technology Stack
- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS v4
  - **Configuration**: Managed via `@theme` in `app/globals.css`, *not* a javascript config file.
  - **Theming Strategy**: CSS Variables + `next-themes` (Class-based).
- **Animation**: `framer-motion` (Page transitions, cursor movement, layout animations).
- **Icons**: `lucide-react` & Custom SVG Doodles.
- **Fonts**:
  - `Patrick Hand` (Google Fonts) - Main UI/Handwriting.
  - `Fira Code` (Google Fonts) - Terminal/Code.

## 3. Architecture & Key Areas

### A. Theming System (CRITICAL)
The theming system was recently refactored for **instant, zero-delay switching**.
- **Provider**: `ThemeProvider` in `app/layout.tsx` uses `attribute="class"`.
- **Global Styles**: `app/globals.css` defines the source of truth.
  - **Variables**: `--c-paper`, `--c-ink`, `--c-heading`, and `--d-*` (doodles).
  - **Switching Logic**: The mechanism relies on CSS variables changing values under the `.dark` selector.
  - **Optimization**: Do **NOT** use JavaScript state (e.g., `theme === 'dark' ? 'text-white' : 'text-black'`) for static styling. Use `text-[var(--c-heading)]` to avoid hydration mismatches and rendering lag.

### B. Custom Cursor (`components/SketchbookCursor.tsx`)
A complex component handling both the tool visualization and the drawing trail.
- **Logic**: Uses `requestAnimationFrame` to draw fading lines on a `<canvas>` overlay.
- **Theme Awareness**: Uses a `useRef` to track `resolvedTheme`. This allows the animation loop to switch between "Graphite" (Light) and "Chalk" (Dark) styles without restarting the loop or suffering from stale closures.

### C. Doodles (`components/SketchbookDoodles.tsx`)
A collection of decorative SVG elements (clouds, stars, arrows).
- **Styling**: Controlled by CSS variables (`--d-amber`, `--d-slate`, etc.).
- **Light Mode**: Deep, ink-like colors, 30% opacity, thin strokes (1.2px) for a subtle watermark effect.
- **Dark Mode**: Pastel/Chalk colors, higher visibility, thicker strokes (2.5px).

### D. Terminal (`components/Terminal.tsx` & `context/TerminalContext.tsx`)
- **State**: `TerminalContext` manages output history and command memory globally.
- **Functionality**: Fully functional CLI with commands like `help`, `projects`, `resume`, `socials`.

## 4. conventions & Best Practices
1.  **Mobile Responsiveness**:
    - **Hide Decorations**: The Cursor, Doodles, and Social Sidebar are hidden on mobile (`hidden md:block`) to prevent clutter and touch-event interference.
    - **Layout**: Navigation shifts to a compact form; typography scales down.
2.  **Asset Management**:
    - Doodles are strictly defined components, not separate image files.
    - Global font variables: `font-hand`, `font-mono`.
3.  **Performance**:
    - Avoid `useEffect`-based styling where CSS variables can do the job.
    - Ensure `SketchbookCursor` is mounted only on client (`if (!mounted) return null`) to prevent hydration errors.

## 5. Recent Fixes (Debugging History)
- **Fix**: Dark Mode Heading Lag.
  - *Solution*: Removed JS-based color logic and `transition-duration` on text. Implemented `--c-heading` CSS variable.
- **Fix**: Missing Chalk Trail.
  - *Solution*: Updated `SketchbookCursor` to use `themeRef` instead of stale `theme` state in the canvas loop.
- **Fix**: Doodle Visibility.
  - *Solution*: Standardized all doodle colors to variables. Tuned Light Mode to be high-contrast "ink" but low opacity (30%) to blend with paper.

## 6. Future Roadmap (Context for Next Agent)
- [ ] **Persistent Terminal**: The terminal state persists, but more complex features (like a filesystem mock) could be added.
- [ ] **Projects Page Interaction**: Currently a grid. Could be enhanced with a "folder" or "blueprint" opening animation.
- [ ] **Sound Effects**: Adding subtle pencil scratching or page turning sounds (auditory feedback).
