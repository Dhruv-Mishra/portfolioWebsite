# Batch Prompt: All Project Videos

Paste everything in the block into the Omni agent. Attach `portfolio/public/resources/audioAgent.webp` once as the shared style reference. Encode each download with the command in [SKILL.md](SKILL.md) before replacing the file in `public/resources`.

```text
Generate 11 separate videos, one per brief below. Each brief is its own generation; never merge briefs or carry content between them. The videos must look like pages from the same sketchbook, so every prompt you send is: the STYLE block, then the brief's three beats, then the END block, then the AUDIO block, with [ACCENT] and [TITLE] filled in from the brief. Keep the STYLE, END, and AUDIO wording exactly as written. Use the attached image only as a style reference for the paper, line work, and watercolour handling; do not copy its content or its green colour. Make two takes of each video and keep the one with the cleanest title lettering and no cuts. Name each output with the slug given.

STYLE:
One continuous top-down shot of a single page in a cream sketchbook with a faint pale-grey grid, no scene cuts. Hand-drawn stop-motion animation: graphite pencil and fine black ink line art with loose hatching, plus cut-paper pieces held down by strips of masking tape. Lines draw themselves onto the page with a gentle hand-drawn wobble, animated on twos. The only colour is [ACCENT] watercolour, used in soft washes on a few key shapes; everything else stays ink and pencil on cream paper. Soft daylight from the upper left, faint shadows under the paper cutouts. The camera drifts slowly and pushes in gently, and never leaves the page.

END:
[12-15s] The camera eases back to show the whole page. "[TITLE]" is hand-lettered in black ink near the bottom with a wavy [ACCENT] underline. Everything settles and holds still.

AUDIO:
Audio: soft pencil scratching, paper rustles and taps, and a warm lo-fi felt-piano and marimba track at a relaxed tempo that resolves on a final chord at the end.
No dialogue, no voiceover, no subtitles. No real people, no hands, no photorealism, no glossy 3D look, no colours other than [ACCENT]. The only readable text is the text in quotes; any other writing is wavy scribble lines.

1. jarvis-voice-agent | ACCENT: teal green | TITLE: Jarvis
[0-4s] An ink telephone handset doodle rings, and teal sound-wave squiggles pulse out of it across the page.
[4-8s] The sound wave flows into a sketched browser window showing a city map; a teal location pin drops onto it and a paper load ticket slides in under tape.
[8-12s] Small ink truck doodles roll along the map roads to the pin, and a cut-paper quote card gets a teal check mark.

2. personal-portfolio | ACCENT: indigo | TITLE: whoisdhruv.com
[0-4s] Five paper tabs slide in along the top edge of the page like notebook dividers, and a sketched microphone appears in the middle.
[4-8s] An indigo sound wave ripples out of the microphone; a doodled cursor follows it, flips to another tab, and a sketched form fills itself in with scribble lines.
[8-12s] A small sketched retro terminal window opens with a blinking indigo cursor, and chat bubbles pop up beside it one after another.

3. cropio | ACCENT: sky blue | TITLE: Cropio
[0-4s] A loose pencil sketch of a generic person's head and shoulders, like an instant photo, is taped onto the page.
[4-8s] Sky-blue pose dots and joint lines trace over the head and shoulders, and small sky-blue arrows show the head turning left and right.
[8-12s] Three dashed sky-blue crop frames snap around the head at different framings, then three neat headshot cutouts slide out side by side.

4. invoke | ACCENT: violet | TITLE: Invoke
[0-4s] A sketched desktop microphone listens, and a violet sound wave travels into a doodled laptop screen.
[4-8s] The screen splits into three small terminal windows, each tied to its own branch line that forks off a violet main trunk.
[8-12s] Scribbled code lines write themselves in all three terminals at once; each branch earns a small violet check mark and merges back into the trunk.

5. fluent-ui-android | ACCENT: leaf green | TITLE: Fluent UI Android
[0-4s] An outline of an Android phone is inked onto the page.
[4-8s] Paper UI pieces, a button, a toggle, a card, and a bottom navigation bar, slide in from the page edges and snap into the phone; the toggle flips to leaf green.
[8-12s] The phone copies itself into five smaller phones in a row, each using the same pieces in a different layout, while a small leaf-green shield is stamped beside the first one.

6. hybrid-recommender | ACCENT: rose pink | TITLE: Hybrid Recommender
[0-4s] A doodled film reel unrolls across the page into a strip of blank movie poster frames.
[4-8s] Three ink streams flow into a funnel in the middle: a cluster of stick figures, a pile of genre icons (a theatre mask, a rocket, a heart), and a small ruler; the funnel fills with rose pink.
[8-12s] Three small poster cards drop out of the funnel onto a sketched couch beside a popcorn bucket, and one gets a rose-pink heart sticker.

7. bloom-filter-research | ACCENT: slate grey | TITLE: Bloom Filters
[0-4s] A long row of small ink boxes is drawn across the page, each with a few tally marks inside.
[4-8s] Dozens of paper arrows rush at the row from every side at once; tally marks tick up and slate-grey washes fill the busiest boxes.
[8-12s] A padlock doodle is crossed out, and a hand-drawn bar chart grows beside it: one short bar, then a slate-grey bar three times taller.

8. ivc-vital-checkup | ACCENT: coral red | TITLE: IVC
[0-4s] A sketched kiosk with a round camera lens on top is drawn, and a pencil stick figure walks up and stops a few steps away.
[4-8s] Coral dotted scan lines sweep over the figure from head to toe while a height ruler and a bathroom scale doodle draw themselves beside it.
[8-12s] A coral heartbeat line pulses across the kiosk screen, and a queue of stick figures behind it moves through quickly and shrinks.

9. course-evaluator | ACCENT: tangerine orange | TITLE: Course Evaluator
[0-4s] Two sketched syllabus sheets slide in from the left and right, covered in scribble lines.
[4-8s] Tangerine highlighter strokes mark matching lines on both sheets, and dotted tangerine threads connect each pair across the gap.
[8-12s] The two highlighted sections lift off and overlap into one card, and a tangerine rubber stamp marks it "SAME".

10. atomvault | ACCENT: brass gold | TITLE: AtomVault
[0-4s] A round bank vault door is inked onto the page and its dial turns.
[4-8s] Paper coins and slips travel along ink lines between three small ledger books; one slip tears halfway, then rewinds and mends itself.
[8-12s] Three keycards marked with a crown, a desk, and a person each unlock only their own drawer of a filing cabinet, which glows brass gold.

11. port-solace | ACCENT: warm amber | TITLE: Port Solace
[0-4s] A harbour city of pencil-sketched cubes assembles block by block across the page, cubes popping into place.
[4-8s] Dusk falls through denser hatching while warm amber washes light the windows; a cube car drives along the waterfront and a cube jet ski cuts a wake across the inked water.
[8-12s] A small cube plane loops over the harbour, and four tiny amber player markers linked by dotted lines gather outside a cube bank.
```
