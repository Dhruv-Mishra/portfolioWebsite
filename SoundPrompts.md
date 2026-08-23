# Sound prompts — Gemini music / audio agent

Paste one fenced prompt at a time into a Gemini music/audio agent. Goal: **premium, finished, Apple Ambient / Gemini Live quality** — not stock UI beeps, not meme, not cinematic trailer.

**Skip list (do not regenerate):** `disco-start.mp3`, `disco-loop.mp3`, `matrix.mp3` (matrix loop), button-click, guestbook, command-palette pop, and `portfolio/public/sounds/voice/TTSReference.mp3`. Those already have a job on the site. Only generate the sections below.

**Wiring note for enter / exit / ambient:** enter/exit are wired to Mixkit "Software interface start" / "Software interface back" (`enter.mp3` / `exit.mp3`, Mixkit SFX Free License: https://mixkit.co/license/#sfxFree , source https://mixkit.co/free-sound-effects/interface/). Ambient still unlocks on enter and fades in after 800ms at volume `0.36`. Design the bed so it still feels barely-there after that fade.

**Family bible (keep every cue in one sketchbook):** dusk studio, warm paper, felt, wood, glass, analog tape, close-mic intimacy. Same “room” across the set. Male spoken voice (Gemini Live `Charon`) will sit on top of ambient — never fight 150–400 Hz.

**Master deliverable for every prompt:** 48 kHz, 24-bit stereo WAV (or AIFF) first. We will encode MP3 later. No lyrics, no dialogue, no 8-bit, no trailer hits, no copyrighted melody.

---

## Voice ambient — live session bed

**Purpose / when it plays.** Looping bed while a native voice-agent session is live. It does **not** play on the rest of the site. Unlocks on enter, then fades in after 800ms at volume `0.36`. Must duck under male spoken voice the entire time.

**Target file:** `portfolio/public/sounds/voice/ambient.mp3`  
**Replace:** current ~12s loop at ~64 kbps.

| Spec | Target |
|---|---|
| Duration | 20–32 seconds, **seamless loop** |
| Loudness | integrated about **-28 to -24 LUFS**; leave **6–8 dB** true-peak headroom |
| Loop vs one-shot | Seamless loop (first sample must match last; no fade-in/out envelope that clicks on wrap) |
| Playback | Stereo, under speech, volume 0.36 after an 800ms fade-in |

### Exact Gemini prompt

```text
Create one finished looping ambient music bed for a live voice-agent session on a personal sketchbook website. Reference vibe: Apple Fitness+ / Apple Meditation ambient, and the barely-there waiting bed in Google Gemini Live. Premium hardware product audio, not stock UI, not spa cliché, not film score.

SCENE
A dusk studio with a hardcover sketchbook open on a wooden desk. Warm analog air. Soft felted piano dust OR a distant analog pad — choose one as the main color and keep the other as a ghost, never both competing. Paper-room atmosphere: dry, close, intimate. Tape hiss almost inaudible, like a well-maintained cassette left running in another room.

MUSICAL CONTENT
- Seamless loop, 20 to 32 seconds. The first 200 ms and last 200 ms must be interchangeable so a hard cut loops invisibly. No fade-in, no fade-out, no swell into the loop point.
- No melody hook. No recognizable motif. No arpeggio that the ear can hum. Slow harmonic cloud only: two or three close, warm tones that barely move.
- If piano dust: extremely soft felted upright, single overtones and pedal resonance only, no played tune, notes appear like dust motes.
- If analog pad: distant Juno / tape-saturated sine pad, heavily low-passed, slow filter breath, no filter-open climax.
- Almost inaudible tape hiss and paper-air only. No percussion. No transients. No pulses that could be mistaken for a metronome.

MIX FOR SPEECH
This bed plays under a male spoken voice (baritone / Gemini Live Charon). Design a hole for speech:
- Keep energy out of ~150–400 Hz so vowels stay clear.
- No midrange honk, no sparkling top that fights sibilance.
- Stereo, wide but gentle; center is mostly empty air.
- Target integrated loudness -28 to -24 LUFS. Leave 6–8 dB true-peak headroom. Never brickwall.

DELIVERABLE
One 48 kHz 24-bit stereo WAV, 20–32 seconds, seamless loop, ready for us to encode as MP3.

NEGATIVE PROMPTS
No lyrics, no humming, no dialogue, no vocoder, no choir.
No 8-bit, chiptune, lo-fi beat, vinyl crackle montage, rain loop cliché, ocean waves, birds as melody.
No cinematic trailer, no riser, no whoosh, no boom, no hit, no reverse cymbal.
No copyrighted melody, no recognizable song interpolation, no Apple / Google logo sting recreation.
No percussion transients, no kick, no clap, no shaker, no clock tick.
No melody hook, no ostinato you can whistle, no arpeggiator, no sidechain pumping.
```

**Negative prompts (summary):** no lyrics, no dialogue, no 8-bit, no trailer hits, no copyrighted melody, no percussion transients, no melody hook.

---

## Voice enter — agent mode startup

**Purpose / when it plays.** Short premium cue when the visitor enters native voice mode (homepage “Talk to me”, settings, command palette, or chat control). Hardware-like connect, not a game power-up.

**Target file:** `portfolio/public/sounds/voice/enter.mp3`  
**Wired ID:** `voice-enter` — Mixkit “Software interface start” (2574), Mixkit SFX Free License.

| Spec | Target |
|---|---|
| Duration | **450–700 ms** audible body; extra tail **< 1.2 s** total |
| Loudness | **-18 LUFS max**, short, dry-ish |
| Loop vs one-shot | One-shot |
| Image | Dry center, tiny stereo bloom |

### Exact Gemini prompt

```text
Create one finished one-shot UI connect chime for entering a native voice-agent mode on a sketchbook website. Think AirPods spatial chime or Gemini Live connect: premium hardware, calm, expensive, adult. Not a game power-up, not a notification badge, not a sci-fi boot.

TIMING
Audible body 450–700 milliseconds. Total file including decay under 1.2 seconds. No pre-roll silence longer than 20 ms.

SOUND
Soft glass or light wood struck once, then one tasteful rising harmonic — a single gentle interval, not a scale. Rising but barely. Dry-ish center image with a tiny stereo bloom on the harmonic only. Same dusk-studio / paper-desk family as a warm analog product, not a cathedral.

ENERGY
One event. No whoosh overkill, no riser sweep, no noise whoosh, no reverse swell, no sparkle shower. Leave the last 300–400 ms as a soft harmonic tail that disappears cleanly.

MIX
Stereo, mostly mono-compatible. Peak short. Integrated loudness no louder than -18 LUFS. Leave headroom; do not clip. 48 kHz 24-bit WAV.

NEGATIVE PROMPTS
No lyrics, no dialogue, no voice, no whisper.
No 8-bit, coin, power-up, Xbox / PlayStation startup parody, slot machine.
No cinematic trailer hit, no braam, no riser, no whoosh, no reverse cymbal.
No copyrighted melody, no OS startup recreation that quotes a real brand sting.
No long reverb wash, no chorus guitar, no EDM pluck.
```

**Negative prompts (summary):** no lyrics, no dialogue, no 8-bit, no trailer hits, no copyrighted melody, no whoosh/riser, no voice.

---

## Voice exit — agent mode shutdown

**Purpose / when it plays.** Distinct pair to enter when the session ends and the site takes the visitor back. Soft hang-up / closing a notebook / line drop. Not an error.

**Target file:** `portfolio/public/sounds/voice/exit.mp3`  
**Wired ID:** `voice-exit` — Mixkit “Software interface back” (2575), Mixkit SFX Free License.

| Spec | Target |
|---|---|
| Duration | **400–650 ms** audible; short resolving tail |
| Loudness | same family as enter, slightly quieter / darker; about **-18 to -20 LUFS** |
| Loop vs one-shot | One-shot |
| Character | Descending or resolving; warmer and darker than enter |

### Exact Gemini prompt

```text
Create one finished one-shot UI shutdown cue that is the pair of a soft glass/wood enter chime. Same instrument family, same dusk-studio sketchbook desk, but this one is the hang-up: closing a hardcover notebook, or a telephone line dropping politely. Premium, adult, calm. Not an error buzzer.

TIMING
Audible body 400–650 milliseconds. Total file under ~1.1 seconds including tail.

SOUND
Same glass or light wood as a connect chime, but descending or resolving — a warmer, darker interval that settles downward. Slightly more felt and paper in the body. Tiny stereo, still dry-ish. Imagine the lid of a notebook meeting the desk, then a single low harmonic letting go.

ENERGY
One event. No alarm, no disconnect modem squawk, no error buzz, no sad trombone. No whoosh, no riser, no tape-stop gag.

MIX
Stereo, center-weighted. About -18 to -20 LUFS, a touch quieter and darker than a connect chime. 48 kHz 24-bit WAV.

NEGATIVE PROMPTS
No lyrics, no dialogue, no voice.
No 8-bit, no error buzzer, no buzzkill brass, no Windows critical-stop.
No cinematic trailer hit, no boom, no riser, no whoosh.
No copyrighted melody, no brand hang-up sting recreation.
```

**Negative prompts (summary):** no lyrics, no dialogue, no 8-bit, no trailer hits, no copyrighted melody, no error buzzer.

---

## Voice hangup (red phone)

**Purpose / when it plays.** Even shorter confirmation when the user taps the live red-phone hang-up control. Same family as exit, slightly drier and clickier — a tactile “you hung up” proof, not a second exit score.

**Target file:** `portfolio/public/sounds/voice/hangup.mp3`  
**New ID.**

| Spec | Target |
|---|---|
| Duration | **200–350 ms** |
| Loudness | short, drier than exit; about **-18 to -20 LUFS** |
| Loop vs one-shot | One-shot |
| Character | Same family as exit; drier / clickier |

### Exact Gemini prompt

```text
Create one finished ultra-short hang-up confirmation for a red-phone button on a voice-agent HUD. Same family as a soft notebook-close / line-drop exit chime, but drier and clickier. It should feel like a well-made hardware switch plus a hint of the exit interval — not a second full shutdown cue.

TIMING
200–350 milliseconds total. Almost no tail. No pre-delay.

SOUND
A small dry mechanical click or soft wood latch in the center, fused with a very short darker harmonic (one or two cycles) so it still belongs with the enter/exit pair. Less bloom, less air, more fingertip. Intimate close-mic, dusk studio, paper desk.

ENERGY
One confirmation only. Not an error. Not a slam. Not a cartoon phone slam.

MIX
Nearly mono, tiny stereo. -18 to -20 LUFS. 48 kHz 24-bit WAV.

NEGATIVE PROMPTS
No lyrics, no dialogue, no busy-signal, no DTMF parody, no modem.
No 8-bit, no buzzer, no trailer hit, no whoosh.
No copyrighted melody, no real telephone brand sample.
```

**Negative prompts (summary):** no lyrics, no dialogue, no 8-bit, no trailer hits, no copyrighted melody, no busy-signal.

---

## Page turn — paper flip

**Purpose / when it plays.** Signature sketchbook cue on client route change (page turn). This is the site’s paper identity, not a UI beep.

**Target file:** `portfolio/public/sounds/page-flip.mp3`  
**Replace:** current tiny/quiet ~1.5s file.

| Spec | Target |
|---|---|
| Duration | **300–500 ms** |
| Loudness | intimate close-mic; design for playback around site SFX level (we will gain-stage). Aim roughly **-20 to -18 LUFS** with lots of transient headroom |
| Loop vs one-shot | One-shot |
| Character | Real hardcover sketchbook page, dry, no cartoon |

### Exact Gemini prompt

```text
Create one finished close-mic recording-style one-shot of a real paper page turning in a hardcover sketchbook. This is the signature navigation sound of a hand-drawn personal website. Intimate, dry, physical, premium field-recording quality.

TIMING
300–500 milliseconds. The flip should complete; do not leave a long rustle tail. No long reverb.

PERFORMANCE
One page only. Right hand turning a mid-weight sketchbook leaf against a hard cover. Fibers, air, a short paper whisper, a tiny cover thud at the end if it is quiet and real. Dry desk, dusk studio. Close mic, 20–30 cm, slight stereo from the page moving left-to-right or right-to-left — pick one and keep it natural.

DO NOT stylize
No cartoon boing, no comedy page whip, no whoosh layer, no magic sparkle, no vinyl, no music sting under the paper.

MIX
Dry. Almost no reverb (if any, 80 ms room only). 48 kHz 24-bit stereo WAV. Natural transient, no limiter squash. Roughly -20 to -18 LUFS integrated, peaks allowed to be lively.

NEGATIVE PROMPTS
No lyrics, no dialogue, no foley library watermark.
No 8-bit, no cartoon take, no slapstick.
No cinematic trailer, no riser, no whoosh bed, no orchestral hit.
No copyrighted melody (there should be no melody at all).
```

**Negative prompts (summary):** no lyrics, no dialogue, no 8-bit, no trailer hits, no copyrighted melody, no cartoon boing, no long reverb.

---

## Voice tool-acting

**Purpose / when it plays.** One soft confirmation when the voice agent **commits** a visual tool (navigate, open project, etc.). Must not mask speech. One cue per committed visual tool.

**Target file:** `portfolio/public/sounds/voice/action.mp3`  
**Replace:** current `action.mp3`.

| Spec | Target |
|---|---|
| Duration | **250–400 ms** |
| Loudness | about **-20 LUFS**, sit under / beside speech |
| Loop vs one-shot | One-shot |
| Character | Muted mallet **or** paper-tap + tiny harmonic |

### Exact Gemini prompt

```text
Create one finished soft confirmation one-shot for a voice agent committing a visual tool on a sketchbook website (page navigate, open a project card). It must not mask a male speaking voice. Think a muted wooden mallet on a felted piano frame, OR a fingertip paper-tap plus one tiny harmonic dust mote. Premium, quiet, adult.

TIMING
250–400 milliseconds. Short tail. No anticipatory whoosh.

SOUND
Choose one: (1) muted mallet / felted wood tick with a single warm overtone, or (2) close paper tap plus a barely-there glass harmonic. Same dusk-studio family as the enter chime, but smaller and more tactile. Center image. No melody.

SPEECH SAFETY
Keep 150–400 Hz reserved. No bright click that steals consonants. About -20 LUFS integrated. 48 kHz 24-bit stereo WAV, almost mono.

NEGATIVE PROMPTS
No lyrics, no dialogue, no camera shutter cliché unless it is extremely muted and paper-like.
No 8-bit coin, no success fanfare, no UI “ding” stock pack.
No trailer hit, no whoosh, no riser.
No copyrighted melody.
```

**Negative prompts (summary):** no lyrics, no dialogue, no 8-bit, no trailer hits, no copyrighted melody, no success fanfare.

---

## Voice error

**Purpose / when it plays.** Mic denied, session failed, or the voice overlay enters an error state. Soft and adult — never harsh.

**Target file:** `portfolio/public/sounds/voice/error.mp3`  
**New ID.**

| Spec | Target |
|---|---|
| Duration | **400–600 ms** |
| Loudness | present but polite; about **-18 to -20 LUFS** |
| Loop vs one-shot | One-shot |
| Character | Minor-interval glass tick |

### Exact Gemini prompt

```text
Create one finished soft error one-shot for a voice-agent failure (microphone denied, session failed). Adult, polite, slightly sorry — not harsh, not comic, not an alarm.

TIMING
400–600 milliseconds.

SOUND
A minor-interval glass tick: two close, dark glass or wine-glass-rim tones a minor second or minor third apart, very short, warm, no sustain choir. Same dusk-studio desk as the enter/exit pair so it still belongs to the product, but clearly “something did not work.” Tiny stereo.

ENERGY
No siren, no klaxon, no square-wave buzzer, no health-game damage blip, no sad trombone.

MIX
-18 to -20 LUFS. 48 kHz 24-bit WAV.

NEGATIVE PROMPTS
No lyrics, no dialogue, no spoken “error”.
No 8-bit, no alarm siren, no smoke detector, no ambulance.
No trailer hit, no boom, no riser.
No copyrighted melody, no OS critical-stop recreation.
```

**Negative prompts (summary):** no lyrics, no dialogue, no 8-bit, no trailer hits, no copyrighted melody, no alarm siren.

---

## Voice barge-in acknowledge

**Purpose / when it plays.** Ultra-short mute-click proving the agent heard an interrupt (user started talking over the agent). Tactile proof, not a musical event.

**Target file:** `portfolio/public/sounds/voice/barge-in.mp3`  
**New ID.**

| Spec | Target |
|---|---|
| Duration | **80–140 ms** |
| Loudness | tiny; about **-22 to -18 LUFS** (very short, so judge by peak, not song-loudness) |
| Loop vs one-shot | One-shot |
| Character | Almost a tactile tick |

### Exact Gemini prompt

```text
Create one finished ultra-short barge-in acknowledge tick. A voice agent was speaking; the user interrupted; this click proves the mic took the floor. It should feel like a hardware mute / AirPods stem click, not a UI sound pack.

TIMING
80–140 milliseconds. Hard stop. No tail longer than a few milliseconds. No pre-roll.

SOUND
Almost a tactile tick: fingernail on paper, or a tiny damped wood switch. Dry mono-center. Zero melody. Zero bloom. Same quiet sketchbook desk, but this is haptic more than musical.

MIX
Very small. Do not let it mask the first syllable of the user’s speech. 48 kHz 24-bit WAV, mono or near-mono.

NEGATIVE PROMPTS
No lyrics, no dialogue.
No 8-bit blip, no mouse click stock, no camera shutter, no typewriter clack sequence.
No trailer hit, no whoosh, no riser.
No copyrighted melody.
```

**Negative prompts (summary):** no lyrics, no dialogue, no 8-bit, no trailer hits, no copyrighted melody.

---

## Terminal hint landed

**Purpose / when it plays.** Optional. One soft “nudge landed” when the public terminal `hint` easter-egg command succeeds. Not per-keystroke. Not a fanfare.

**Target file:** `portfolio/public/sounds/hint.mp3`  
**New ID.**

| Spec | Target |
|---|---|
| Duration | **200–350 ms** |
| Loudness | quiet desk cue; about **-20 LUFS** |
| Loop vs one-shot | One-shot |
| Character | Sketchbook pencil tick **or** distant chime |

### Exact Gemini prompt

```text
Create one finished soft one-shot for a terminal easter-egg “hint” command that succeeded. A nudge landed. Sketchbook pencil tick on paper, OR one distant glass chime far in the dusk studio — not a fanfare, not a game achievement, not a key-click.

TIMING
200–350 milliseconds.

SOUND
Prefer a single graphite pencil tick on heavy paper, maybe with one very quiet distant harmonic so it feels designed. Intimate, dry, handmade. Same world as a hardcover sketchbook site.

ENERGY
One event only. Never a melody, never a reward jingle, never per-keystroke typing.

MIX
About -20 LUFS. 48 kHz 24-bit stereo WAV, mostly center.

NEGATIVE PROMPTS
No lyrics, no dialogue, no whispered hint text.
No 8-bit coin, no RPG level-up, no slot win.
No trailer hit, no whoosh, no copyrighted melody.
```

**Negative prompts (summary):** no lyrics, no dialogue, no 8-bit, no trailer hits, no copyrighted melody, no fanfare.

---

## Theme dark (optional replace)

**Purpose / when it plays.** Theme toggle into dark. Keep the cricket-night joke, but make it a premium field recording, not a stock meme pack.

**Target file:** `portfolio/public/sounds/theme-dark.mp3`  
**Optional replace.**

| Spec | Target |
|---|---|
| Duration | **2.0–2.5 s** |
| Loudness | atmospheric, not a jump-scare; about **-22 to -18 LUFS** |
| Loop vs one-shot | One-shot (short bed, not a loop) |
| Character | Night crickets, field-recording quality |

### Exact Gemini prompt

```text
Create one finished 2.0 to 2.5 second one-shot of a premium night field recording: crickets and warm dark-country air, as a gentle joke for switching a website to dark theme. It should still read as “night” in one second, but sound like a real summer evening recorded on good mics — not a cartoon cricket, not a royalty-free zip file.

TIMING
2.0–2.5 seconds. Soft edges, no click in or out. Not a loop.

SOUND
Layered cricket chorus at a believable distance, maybe one closer cricket, very quiet warm air, no traffic, no dogs, no music. Stereo, spacious, dusk-to-night. Keep it tasteful enough to play at low site SFX volume.

JOKE, NOT MEME
The joke is the idea (dark mode = night). The recording itself must be adult and beautiful.

MIX
About -22 to -18 LUFS, 6 dB headroom. 48 kHz 24-bit stereo WAV.

NEGATIVE PROMPTS
No lyrics, no dialogue, no owl hoot punchline, no Halloween, no thunderclap.
No 8-bit, no stock “cricket.wav” chirp loop that repeats every 200 ms.
No trailer hits, no riser, no copyrighted melody, no music bed.
```

**Negative prompts (summary):** no lyrics, no dialogue, no 8-bit, no trailer hits, no copyrighted melody, no cartoon cricket.

---

## Theme light (optional replace)

**Purpose / when it plays.** Theme toggle into light. Keep the rooster joke, but make it a short distant morning farm, not a cartoon cock-a-doodle.

**Target file:** `portfolio/public/sounds/theme-light.mp3`  
**Optional replace.**

| Spec | Target |
|---|---|
| Duration | **2.0–2.5 s** |
| Loudness | distant, not in-your-face; about **-22 to -18 LUFS** |
| Loop vs one-shot | One-shot |
| Character | Distant morning farm / rooster, premium |

### Exact Gemini prompt

```text
Create one finished 2.0 to 2.5 second one-shot of a distant morning farm: a real rooster far across a field, plus quiet early air, as a gentle joke for switching a website to light theme. Premium nature recording, not a cartoon cock-a-doodle-doo, not a meme soundboard.

TIMING
2.0–2.5 seconds. One distant call that fits the window; maybe a softer echo. Soft edges.

SOUND
Rooster 30–60 meters away, not on the microphone. Light morning air, maybe a hint of doves or leaves, never a barnyard chaos pile-up. Stereo, spacious. The joke is “light mode = morning.” The recording should feel filmed, not downloaded.

MIX
About -22 to -18 LUFS, 6 dB headroom. 48 kHz 24-bit stereo WAV.

NEGATIVE PROMPTS
No lyrics, no dialogue, no alarm-clock layer, no cartoon rooster, no Foghorn Leghorn, no comedy slide whistle.
No 8-bit, no trailer hits, no copyrighted melody, no music bed, no church bells.
```

**Negative prompts (summary):** no lyrics, no dialogue, no 8-bit, no trailer hits, no copyrighted melody, no cartoon rooster.
