---
name: project-video
description: 'Write a Gemini Omni 1.2 Flash prompt for a project preview video that matches the portfolio sketchbook look and the existing project videos, then encode it for public/resources. Use when adding a new project to lib/projects.tsx, regenerating one project video, or fixing a bad take.'
---

# Project Video (Gemini Omni 1.2 Flash)

Every project video is one page of the same sketchbook. The deployed set is 10 seconds (Omni's default duration) at 16:9; keep new clips at 10 seconds so they match. Prompts never mention duration, ratio, or resolution. For all projects at once, use [batch-prompt.md](batch-prompt.md); that exact prompt produced the deployed set.

## Steps

1. Read the project in `portfolio/lib/projects.tsx`: what it does, the top highlight, and the card `colorClass`.
2. Pick an accent from the registry that no other project uses, then add it to the table.
3. Write three beats: what goes in, what the project does, what comes out. Use concrete objects (phone, map pin, vault door), never abstract ideas.
4. Fill the template. Keep beats to one or two sentences each.
5. In Omni, attach `portfolio/public/resources/audioAgent.webp` as the style reference, plus the project thumbnail if it shows a useful subject.
6. Generate two or three takes (there is no seed), keep the best, and check it against the review list.
7. Encode two files into `portfolio/public/resources/video/`: `<slug>.av1.mp4` (AV1 + Opus, served first) and `<slug>.mp4` (H.264 + AAC, the fallback for browsers without AV1 such as older Safari). `getProjectVideoSources` in `lib/projects.tsx` builds both paths from the slug, and `ProjectModal` lists them as `<source>` elements. If the project has `video: null`, delete that line.

   ```powershell
   $in = '<omni-download>.mp4'; $out = 'portfolio/public/resources/video/<slug>'; $vf = 'scale=854:480:flags=lanczos,format=yuv420p'
   ffmpeg -i $in -vf $vf -c:v libsvtav1 -preset 2 -crf 56 -g 240 -svtav1-params tune=0:enable-overlays=1:scd=1 -c:a libopus -b:a 32k -ac 1 -movflags +faststart -map_metadata -1 "$out.av1.mp4"
   ffmpeg -i $in -vf $vf -c:v libx264 -preset veryslow -tune animation -profile:v high -crf 33 -c:a aac -aac_coder twoloop -ac 1 -ar 44100 -b:a 40k -movflags +faststart -map_metadata -1 "$out.mp4"
   ```

   For 10 seconds, expect about 135 to 265 KB for AV1 (VMAF about 86 to 91) and 210 to 370 KB for H.264 (VMAF about 76 to 85). These settings won VMAF tests against placebo presets, denoising, and AQ tweaks. Raising H.264 to CRF 35 washes out the paper grid.
8. `/resources` is cached as immutable for a year. To replace a clip that is already deployed, give it a new file stem (for example `video: 'cropio-2'`) instead of overwriting the old file.

## Template

Copy everything inside the block. Replace `[ACCENT]`, `[TITLE]`, and the three beats.

```text
Use the attached image only as a style reference for the paper, line work, and watercolour handling. Do not copy its content or its green colour.

One continuous top-down shot of a single page in a cream sketchbook with a faint pale-grey grid, no scene cuts. Hand-drawn stop-motion animation: graphite pencil and fine black ink line art with loose hatching, plus cut-paper pieces held down by strips of masking tape. Lines draw themselves onto the page with a gentle hand-drawn wobble, animated on twos. The only colour is [ACCENT] watercolour, used in soft washes on a few key shapes; everything else stays ink and pencil on cream paper. Soft daylight from the upper left, faint shadows under the paper cutouts. The camera drifts slowly and pushes in gently, and never leaves the page.

[0-4s] <beat 1: the input or the problem>
[4-8s] <beat 2: the project doing its main job>
[8-12s] <beat 3: the result>
[12-15s] The camera eases back to show the whole page. "[TITLE]" is hand-lettered in black ink near the bottom with a wavy [ACCENT] underline. Everything settles and holds still.

Audio: soft pencil scratching, paper rustles and taps, and a warm lo-fi felt-piano and marimba track at a relaxed tempo that resolves on a final chord at the end.
No dialogue, no voiceover, no subtitles. No real people, no hands, no photorealism, no glossy 3D look, no colours other than [ACCENT]. The only readable text is the text in quotes; any other writing is wavy scribble lines.
```

## Accent Registry

| Project | Slug (file stem) | Accent | Title card |
| --- | --- | --- | --- |
| Jarvis | jarvis-voice-agent | teal green | "Jarvis" |
| This Portfolio | personal-portfolio | indigo | "whoisdhruv.com" |
| Cropio | cropio | sky blue | "Cropio" |
| Invoke | invoke | violet | "Invoke" |
| Fluent UI Android | fluent-ui-android | leaf green | "Fluent UI Android" |
| Hybrid Recommender | hybrid-recommender | rose pink | "Hybrid Recommender" |
| Bloom Filter Research | bloom-filter-research | slate grey | "Bloom Filters" |
| IVC | ivc-vital-checkup | coral red | "IVC" |
| Course Evaluator | course-evaluator | tangerine orange | "Course Evaluator" |
| AtomVault | atomvault | brass gold | "AtomVault" |
| Port Solace | port-solace | warm amber | "Port Solace" |

## Rules

- Keep the style paragraph, end card, audio line, and exclusions word for word. They are what make the set look like one sketchbook.
- Keep it to one shot. Omni cuts between shots unless told not to.
- Quote every word that should be readable and keep it short. Unquoted writing turns into fake letters.
- Draw people as simple pencil stick figures or loose outlines, never faces or real people.
- Avoid fast action and complicated physics. Slow, readable motion works better.
- Do not use angle-bracket tags like `<FIRST_FRAME>`; they are deprecated. Describe each image's role in plain words.

## Review A Take

Reject it if there is a cut, live-action footage, a hand, a colour outside the accent, garbled text in the title card, speech, or a title card that does not hold still at the end.

To fix a near-miss, edit the take rather than rerolling. State one change and end with "Keep everything else the same.", for example:

- `Remove the hand. Keep everything else the same.`
- `Make the title read "Cropio" in clean hand lettering. Keep everything else the same.`
- `Make the music quieter under the pencil sounds. Keep everything else the same.`
- `Turn the red details into sky blue. Keep everything else the same.`
