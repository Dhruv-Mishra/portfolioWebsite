# Gemini Omni Batch Video Prompt

Copy the single prompt below into Gemini Omni to generate all nine project videos in one batch.

## Master prompt

```text
Generate NINE separate finished video assets in this one batch, one for each project below. If the generation interface queues jobs, run all nine jobs. Do not make a montage, contact sheet, storyboard, or one video with nine chapters. Do not stop after the first generation.

WEBSITE STYLE BIBLE

These videos belong to Dhruv Mishra's portfolio, a light, tactile, living-sketchbook website. Use this visual system in every clip:

- Background: warm off-white paper (#fdfbf7) with a very subtle pale graph-paper grid and light paper grain.
- Project frame: one pale butter-yellow sticky-note card (#fff9c4), slightly rotated, with imperfect graphite edges, soft tape corners, and a small paper shadow. All project cards use this same note color; project identity comes from accent ink and interface colors, not different card backgrounds.
- Drawing language: dark charcoal ink (#2d2a2e), loose handwritten headings, small monospace labels, pencil arrows, highlighter strokes, underlines, rough circles, and occasional hand-drawn cursor marks.
- Product presentation: the real idea of the project is the hero. Show crisp browser panels, phone screens, diagrams, ledgers, or research charts as paper inserts on the note. The sketchbook framing should support the product, not obscure it.
- Motion language: restrained 2D or 2.5D paper collage, gentle camera drift, believable cursor/hand movements, subtle tape and paper movement, and continuous cause-and-effect. Avoid rapid cuts and visual morphing.
- Palette rule: keep the paper, ink, tape, grid, and handmade composition consistent; use the project accent listed below for highlights, controls, arrows, and data states.

VIDEO RULES

- Make each clip exactly 10 seconds, landscape 16:9, 1920x1080 when supported, polished and card-ready.
- Use this timing: 0-2 seconds establish the project card and hero interface; 2-8 seconds show one coherent workflow; 8-10 seconds settle on a clear result.
- Make the first and last frames stable and visually compatible for muted autoplay and looping. Do not fade to black.
- Include clear, synchronized narration and a brief natural dialogue exchange in every clip; the final video must contain spoken audio, not only SFX.
- Use one consistent warm, concise narrator across all nine clips and distinct natural voices for the user and product exchange. Keep total spoken words under 28 per clip so the speech fits the 10-second runtime.
- Use the exact Narration and Dialogue scripts below. Sync each line to the visible workflow, mix speech clearly above subtle interface SFX, and omit music or keep it extremely quiet.
- Keep text sparse, large, and stable. Render only the project title, short labels, and exact metrics named below. Never invent long paragraphs, URLs, code, logos, people, or claims.
- Keep the product subject prominent with generous margins. Do not let decorative paper marks cover important UI.
- Do not use glossy SaaS dashboards, dark sci-fi holograms, stock footage, generic AI brains, or cinematic title cards.
- Do not use recognizable movie posters or actors, real bank branding or personal data, or medical diagnoses. Use fictional interface data where needed.
- Use the briefs below to render the videos. Return the nine video assets or download links, not a written storyboard.

BATCH OUTPUT

Return nine independent video files with these names:

01-jarvis-voice-agent.mp4
02-cropio.mp4
03-fluent-ui-android.mp4
04-hybrid-recommender.mp4
05-personal-portfolio.mp4
06-bloom-filter-research.mp4
07-ivc-vital-checkup.mp4
08-course-evaluator.mp4
09-atomvault.mp4

PROJECT 1 - JARVIS - VOICE AGENT

Accent: emerald and teal signal lines and controls on the pale-yellow card, with dark charcoal ink.
Show: a voice-to-voice AI agent holding a natural phone conversation while operating a website through tool calling over a persistent WebSocket.
Workflow: active call and microphone waveform -> waveform connects to a browser -> service page navigation, form filling, map opening, and quote generation. Keep the call active during every browser action.
Finish: the active call control and completed service quote are visible together. Use the labels "Place Call" and "Quote" only if legible.
Narration: "Jarvis turns a phone call into a completed website task."
Dialogue: Caller: "Can you get me a quote?" Jarvis: "On it. Your quote is ready."

PROJECT 2 - CROPIO

Accent: sky blue and cobalt editor controls, blue highlighter marks, and dark ink.
Show: a privacy-conscious AI portrait cropper using YOLO11 pose estimation and face-orientation detection to turn one raw photo into polished headshots.
Workflow: one neutral portrait in a browser editor -> transparent pose and face-angle guides -> three crop suggestions -> drag-resize and aspect-ratio change -> full-resolution local export. Keep the portrait and editor spatially consistent.
Finish: three finished headshot crops in the editor with a small local-processing cue. Do not imply server-side image storage.
Narration: "Cropio turns one portrait into polished headshots while keeping the workflow local."
Dialogue: User: "Try a tighter crop." Cropio: "Three clean options are ready."

PROJECT 3 - FLUENT UI ANDROID

Accent: cobalt blue, soft blue, black, and neutral component accents on the pale-yellow card.
Show: the native Kotlin and Java Fluent UI Android design-system library with reusable buttons, cards, navigation, typography, color tokens, Jetpack Compose, and XML layouts.
Workflow: three Android phone screens and a component sheet -> one shared button-color or spacing token changes -> the same change flows through a token swatch, Compose, XML-style components, and all three screens.
Finish: the phones and reusable component cards align as one cohesive design-system showcase. Use generic mail, calendar, and teamwork surfaces, not copied branded app screens.
Narration: "Fluent UI keeps native Android components consistent from one shared design token."
Dialogue: Designer: "Change the accent color." System: "Applied across Compose and XML."

PROJECT 4 - HYBRID RECOMMENDER

Accent: violet, pink, graphite, and a small warm accent on the pale-yellow card.
Show: a context-aware Python movie recommendation engine combining collaborative filtering, content-based signals, and demographic context.
Workflow: fictional group profile, ratings, genre tags, metadata, and demographic context -> three labeled data streams converge -> the cold-start gap fills -> a ranked row of varied fictional movie recommendations appears.
Finish: the recommendation row and converged pipeline remain readable. Use abstract fictional movie cards only; no real posters, titles, actors, or studio marks.
Narration: "Hybrid Recommender blends multiple signals to find a better movie for every viewer."
Dialogue: Viewer: "What works for everyone?" Recommender: "Here are three balanced picks."

PROJECT 5 - PERSONAL PORTFOLIO

Accent: ink black with teal, amber, sky blue, and indigo UI marks. This clip is the portfolio's own signature living-sketchbook interface.
Show: a high-performance Next.js developer website with a hand-drawn Projects page, interactive terminal, AI chat, and a distributed deployment doodle across Azure, GCP, and Oracle Cloud.
Workflow: pencil or chalk cursor selects a project card -> retro terminal opens and runs "projects" -> AI chat receives one concise response -> three labeled cloud-server doodles connect in the background -> return to the Projects page.
Finish: Projects page, terminal cue, chat cue, and the three cloud labels coexist in one calm sketchbook frame. Keep it a website interaction, not a generic infrastructure infographic.
Narration: "This portfolio turns projects, terminal, and AI chat into one living sketchbook."
Dialogue: Visitor: "Show me the projects." Portfolio: "Opening the terminal and chat."

PROJECT 6 - BLOOM FILTER RESEARCH

Accent: dark navy, cyan, lime, and graphite on the pale-yellow research card with a graph-paper insert.
Show: a C++ study optimizing Counting Bloom Filters for high-concurrency systems with relaxed synchronization.
Workflow: worker threads send insert and lookup requests into counting cells -> contention briefly builds -> relaxed synchronization clears the bottleneck -> request streams accelerate -> benchmark reaches the exact label "300% throughput" while accuracy marks stay stable.
Finish: counting grid, fast request streams, stable accuracy indicators, and the 300% benchmark share the frame. Do not fill the scene with unexplained code.
Narration: "Relaxed synchronization gives this Counting Bloom Filter 300 percent more throughput."
Dialogue: Researcher: "Are lookups still accurate?" System: "Accuracy stays stable."

PROJECT 7 - IVC - VITAL CHECKUP

Accent: calm teal, green, white, and graphite with friendly clinical geometry on the pale-yellow card.
Show: a contactless Python, OpenCV, and MediaPipe health-screening kiosk using one camera at a respectful distance.
Workflow: one person stands naturally before the camera -> transparent body landmarks calibrate -> four tiles resolve in order: height, weight, BMI, pulse.
Finish: person, camera frame, landmark overlay, and four screening labels form a reassuring summary. Show estimates only; never show a diagnosis or alarming result.
Narration: "IVC estimates key measurements without contact, helping screening move faster."
Dialogue: Visitor: "What did the scan find?" Kiosk: "Your screening estimates are ready."

PROJECT 8 - COURSE EVALUATOR

Accent: orange, amber, yellow, blue, and graphite with paper clips and highlighter marks.
Show: a Python NLP tool comparing university syllabi with fuzzy matching and text-similarity algorithms to find redundant modules.
Workflow: two fictional syllabus sheets -> related modules connect with hand-drawn lines -> overlaps highlight amber and unique topics stay blue -> similarity-threshold slider moves -> clean course-selection comparison.
Finish: both sheets, threshold control, amber overlaps, and blue unique topics remain visible. Use only a few short fictional module labels.
Narration: "Course Evaluator finds overlapping syllabus content before you choose a class."
Dialogue: Student: "Which modules overlap?" Evaluator: "These amber matches are similar."

PROJECT 9 - ATOMVAULT

Accent: deep blue and emerald, with red only for the error state, on the pale-yellow technical card.
Show: a Java, MySQL, and JDBC banking database with ACID-compliant transactions and role-based access for administrator, teller, and customer.
Workflow: three role panels connect to one protected vault and synchronized ledger -> transfer validates -> brief interruption -> red rollback restores the original ledger -> green recovery completes a successful commit.
Finish: roles, vault, synchronized records, and committed transfer are visible together. Use fictional account names and values only.
Narration: "AtomVault protects transfers with roles, ACID transactions, and automatic recovery."
Dialogue: Teller: "The transfer failed." System: "Rolled back, recovered, and committed."

FINAL CHECK

Before returning the batch, verify that there are nine separate clips, each is 10 seconds and 16:9, each visibly uses the light sketchbook website style, each showcases one signature project workflow, and each ends on a clean muted project-card preview. Correct any clip that drifts into a different visual language.
```
