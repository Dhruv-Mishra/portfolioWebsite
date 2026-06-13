// lib/suggestionResponses.ts — Pregenerated canned replies for the
// pre-baked hardcoded suggestion chips on the chat page.
//
// When the user clicks one of these EXACT suggestion strings, we short-circuit
// the /api/chat round-trip and return the canned reply locally. This keeps the
// hardcoded chip path deterministic even when the backend is unavailable.
//
// Action-bearing suggestions (e.g. "Report a bug") are intentionally NOT
// in this map; they resolve through the client-safe action registry.

const RESPONSES: ReadonlyMap<string, string> = new Map([
  [
    "Tell me about your AI work",
    "I think of my work as AI-forward software engineering: practical agents, production systems, and tools that actually do useful work. Jarvis is the clearest example: a voice-to-voice AI agent that can operate websites through tool calling. Cropio is a smaller AI tool for portrait framing, and this portfolio has its own retrieval-backed chat and action layer. At Microsoft, the same taste shows up as performance, reliability, and infrastructure work at serious scale.",
  ],
  [
    "What do you work on at Microsoft?",
    "I'm a Software Engineer at Microsoft working across AI-forward software engineering, performance-critical product experiences, and production infrastructure. Day to day that means making systems faster, cheaper, more reliable, and easier to operate at scale. The resume has the concrete proof points; the short version is practical engineering where every ms and every incident path matters ~",
  ],
  [
    "What's your tech stack?",
    "Daily drivers: TypeScript, Python, C#, C++, Kotlin, Java, and SQL depending on the job. On the AI/web side I lean on LLM tool calling, RAG, Next.js, React, Tailwind, Node.js, and cloud infrastructure. I still have deep mobile/platform experience, but the bigger pattern is choosing the right tool for reliable software that ships ^_^",
  ],
  [
    "Tell me about Jarvis",
    "Jarvis is my personal side-project — a voice-to-voice AI agent that picks up the phone, holds a real conversation, and actually drives a website on the caller's behalf via tool calling. Think alternative to traditional support / dispatch agents. Vanilla JS frontend with an AudioWorklet streaming 16 kHz PCM, Node.js backend bridging a long-lived WebSocket to a live AI agent, and tool schemas that let the model click buttons, fill forms, and navigate pages for real. Live demo at jarvis.whoisdhruv.com if you want to call it, code is open at github.com/Dhruv-Mishra/AudioControlledAgenticWebsite. Want me to pull up the project card?",
  ],
  [
    "Tell me about Cropio",
    "Cropio is an AI portrait-cropping tool I built for clean, social-ready profile images. It focuses on face-aware framing and fast, practical output rather than making people manually fiddle with crop boxes. Want me to open the project card?",
  ],
  [
    "What's the Escape the Matrix puzzle?",
    "It's a multi-stage easter egg hidden in the home terminal — and honestly it's way more fun if you find your own way through it :) The trail starts with the sticker collection (every interactive surface earns one), and unlocking the right stickers opens up some new commands worth poking at. I'd rather not spoil it. Go play with the terminal, see how far you get, and if you genuinely get stuck try `matrix hint` in there for a stage-appropriate nudge.",
  ],
  [
    "What's disco mode?",
    "Disco mode is the sketchbook getting a little dramatic: the page swaps into a neon dance-floor mood with moving lights, sparkles, and motion on the doodles and notes. It is also tied into the site's hidden sticker and Matrix trail, so it is not just decoration. Engage it when you want the page to stop behaving like a quiet notebook ~",
  ],
  [
    "What projects have you worked on?",
    "A few favorites: Jarvis, a voice-to-voice AI agent that can operate websites; Cropio, an AI portrait cropper; this portfolio with retrieval-backed chat and actions; Course Evaluator, IVC Vital Checkup, AtomVault, a hybrid recommender, Fluent UI Android, and my Counting Bloom Filter research. The projects page has the full wall, but those are the ones I usually point people at first ~",
  ],
  [
    "How does Cropio work?",
    "Cropio is a portrait-cropping tool built around fast, face-aware framing. The point is to get clean social/profile-ready crops without manually dragging boxes forever: upload an image, let the model find a sensible crop around the face, then export the result. It is practical AI, less magic wand and more useful little production tool ~",
  ],
  [
    "Tell me about your time at IIIT Delhi",
    "IIIT Delhi was where the systems side of my brain really got sharper. I did Computer Science and Applied Mathematics, graduated with Academic Honors and an 8.96 CGPA, spent a lot of time in competitive programming, and did undergraduate research at DCLL on high-concurrency Counting Bloom Filters. Good mix of theory, engineering, and getting humbled by hard problems.",
  ],
  [
    "What's your favorite language?",
    "C++ is still the favorite. It is sharp, occasionally rude, and very honest about performance. For day-to-day work I use TypeScript, C++, C#, Kotlin, Python, SQL, Java, and JavaScript depending on the problem, but C++ is the language that taught me to care about what the machine is actually doing.",
  ],
  [
    "How did you get into competitive programming?",
    "Competitive programming started as curiosity and turned into a very effective way to train problem-solving under pressure. I reached Codeforces Expert at 1703 and CodeChef 5-star at 2003, with a few fun contest results like Google Code Jam Farewell Round A global rank 291. It taught me to be fast, precise, and deeply suspicious of edge cases.",
  ],
  [
    "What do you enjoy most about your work?",
    "I like work where intelligence, performance, and reliability meet real users. The fun part is building tools that feel useful, then making the underlying systems fast, cheap, observable, and boring in production. That taste shows up in my AI side projects and in Microsoft-scale performance and infrastructure work.",
  ],
  [
    "Tell me about your research",
    "My undergraduate research was at IIIT Delhi's DCLL lab under Prof. Bapi Chatterjee, focused on optimizing Counting Bloom Filters for high-concurrency systems. The work used relaxed synchronization in C++ and achieved around a 300% throughput increase while keeping false positive/negative behavior minimally affected. Very systems-y, very satisfying.",
  ],
  [
    "What are your hobbies?",
    "Outside code I am into gym and strength training, chess, gaming, travel, PC hardware and overclocking, and following longevity research. I tend to fall into rabbit holes: memory timings one week, a game meta the next, then nutrition or training logs after that.",
  ],
  [
    "Tell me about your PC build",
    "Current build: RTX 3080 Ti, Intel i5-13600KF overclocked to 5.5 GHz on the P-cores, and DDR5 Hynix M-die tuned from 5200 to 6400 MHz CL32 with tight secondary timings. The fun part is the whole stability-testing rabbit hole: thermals, voltages, memory timings, and getting consumer hardware to behave just a little better than stock.",
  ],
  [
    "What games do you play?",
    "Favorites are Witcher 3, Metal Gear Solid V, and the Horizon games. I have also reached Immortal 2 in Valorant, and I play modded Minecraft with friends on an Azure-hosted server I set up and maintain. Apparently even leisure becomes infrastructure eventually.",
  ],
]);

/**
 * Look up a pre-baked response for an EXACT hardcoded suggestion string.
 * Returns the canned reply if matched, otherwise null (caller should fall
 * back to the normal /api/chat round-trip).
 */
export function getSuggestionResponse(text: string): string | null {
  return RESPONSES.get(text) ?? null;
}

/** Diagnostic: every suggestion text the bypass map covers. */
export function getCannedSuggestionTexts(): readonly string[] {
  return Array.from(RESPONSES.keys());
}
