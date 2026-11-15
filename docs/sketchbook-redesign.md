# Sketchbook redesign

A readability and mobile pass over the whole site, compared with production `v0.64.0` (`c58d6af`).

## What changed

**Home**
- Two columns on desktop: intro and voice entry, the terminal, then About and featured projects. Phones read hero, featured, terminal, notes, About.
- Featured projects is an endless slideshow. A CSS pencil line is the clock, so there are no JS timers. It pauses on hover, keyboard focus, hidden tab, offscreen, or a voice call, and never autoplays under reduced motion. Idle slides skip their images.
- "Talk to me" became "Talk to AI Dhruv".

**Terminal**
- Bash-style `guest@dhruv:~$` prompt and a blinking block cursor.
- Opens with a neofetch card: an ASCII sketchbook with a D on the cover, short facts, and the note palette. `neofetch` reprints it. The filler hint line is gone.
- Fira Code renders for real now (the old `font-code` class produced no CSS). The card shrinks to fit narrow terminals instead of wrapping.

**Projects**
- No heading and no lined sheet: sticky notes are taped straight onto the page grid, with clipped photos, curled corners, per-note tilt and the 3D hover tilt.
- Tiles carry one-line summaries; the longer story opens in an expanded note (`?project=` deep links still work).
- Container-query layout: compact horizontal notes on phones, then two and three columns.

**About and resume**
- `/resume` merged into `/about` (308 redirect) with a resume download button.
- Experience is an S-curve on wide columns with small logo tiles, and a straight line on phones. Hover peeks and click pins open an index card under the tile.

**Controls and reading**
- Floating buttons are gone. Desktop has one right-hand rail, phones a corner dock that tucks away while scrolling down plus a drawer.
- Settings > Reading font: Handwritten (default) or Clean (Atkinson Hyperlegible Next, only downloaded when chosen).
- The voice call uses synthesized Web Audio cues, an SVG ink orb and a CSS veil, replacing three MP3s and a 188 KB GIF.
- Accessibility: the hidden "Loading..." status clears, a single `html[data-reduced-motion]` contract drives reduced motion, and focus rings are consistent.

**Code health**
- 119 files changed, net −390 lines. 16 files deleted, including the resume page, three floating-button components and 284 KB of call media.
- New controllable values live in `app/globals.css` and `lib/designTokens.ts`. Dead size scales and unused shadow and interaction tokens were removed.
- Layout is CSS-first: grid, `clamp()`, container queries. JS media hooks only run where behavior differs (the dock mounts on phones only), and canvas effects coalesce resizes per frame.

## Performance

Lab run on one machine: production builds of `c58d6af` and this branch, both behind the same gzip proxy (Nginx and Cloudflare compress in production), cold cache. Mobile emulates a 4× slower CPU, 1.6 Mbps and 150 ms RTT; medians of 5 runs (9 for home and projects on mobile).

| Mobile | LCP | TBT | HTML (gzip) | Route prefetch (RSC) |
|---|---|---|---|---|
| Home | 828 → 856 ms | 148 → 156 ms | 18.6 → 19.4 KB | 52.2 → **30.2 KB** |
| Projects | 1024 → **916 ms** | 211 → **100 ms** | 33.2 → **17.4 KB** | 47.8 → **30.1 KB** |
| About | 1100 → **1000 ms** | 252 → **183 ms** | 28.4 → **18.8 KB** | 47.8 → **30.2 KB** |

| Desktop (unthrottled) | LCP | TBT |
|---|---|---|
| Home | 136 → 140 ms | 0 → 10 ms |
| Projects | 216 → **112 ms** | 43 → **0 ms** |
| About | 232 → **148 ms** | 66 → **18 ms** |

CLS stays at 0 on every page, and home is flat within noise. Projects and About get much cheaper to render: TBT is down 27–53%. A voice call no longer downloads 284 KB of MP3s and a GIF.

Bytes that grew on purpose:
- **Fonts:** the home page loads Fira Code (+23 KB) because the terminal now uses it.
- **Home images:** the featured slideshow shows real previews (+78 KB, lazy).
- **Projects images:** the photos load after first paint (+158 KB on phones).

Only the first project photo is eager. Next preloads eager images in `<head>`, where they compete with render-blocking CSS on slow phones.