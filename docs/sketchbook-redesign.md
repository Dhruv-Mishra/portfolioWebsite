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

Lab run on one machine: production builds of `c58d6af` and this branch, cold cache, median of 5 runs. Mobile emulates a 4× slower CPU, 1.6 Mbps and 150 ms RTT. Bytes are encoded transfer sizes from the local server, so absolute sizes run higher than through Cloudflare compression.

| Mobile | LCP | TBT | HTML | Route prefetch (RSC) | Total |
|---|---|---|---|---|---|
| Home | 2524 → **2108 ms** | 166 → 165 ms | 79.7 → 84.4 KB | 200.7 → **81.6 KB** | 1560 → **1469 KB** |
| Projects | 3744 → **2404 ms** | 240 → **112 ms** | 268.9 → **89.2 KB** | 192.7 → **81.6 KB** | 1701 → **1545 KB** |
| About | 3288 → **2216 ms** | 285 → **188 ms** | 148.9 → **75.7 KB** | 192.7 → **81.6 KB** | 1568 → **1392 KB** |

| Desktop (unthrottled, median of 3) | LCP | TBT |
|---|---|---|
| Home | 116 → 124 ms | 1 → 0 ms |
| Projects | 148 → **128 ms** | 14 → **0 ms** |
| About | 200 → **132 ms** | 63 → **13 ms** |

CLS stays at 0 on every page. Two increases are deliberate:
- Home fonts are 24 KB larger, because the terminal now loads Fira Code.
- Home images are larger because the featured slideshow shows real previews.
