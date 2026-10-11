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
    "At work I build LLM incident-triage agents for on-call engineers. MCP servers give the agent Kusto, service-health, and config tools, with fallback logic and a human in the loop, and it cut manual triage of routine incidents by about 40%. On my own time I build voice agents: Invoke hands coding tasks to Copilot CLI agents by voice, Jarvis negotiates freight rates over a phone call, and this site has a voice agent you can interrupt mid-sentence.",
  ],
  [
    "What do you work on at Microsoft?",
    "I'm a Software Engineer at Microsoft. I build production AI agents and the Azure backend services they run on. Recent work: incident-triage agents built on MCP tools, $240k a year in Azure savings on a backend serving 7B+ requests a day, sandboxed PDF encryption for Office on the web, and faster Office Android startup. I also maintain Fluent UI Android. The resume page has the details ~",
  ],
  [
    "What's your tech stack?",
    "Daily drivers: C#, TypeScript, and Python, plus C++, Kotlin, Java, and SQL depending on the job. On the AI side I work with LLM agents, MCP, tool calling, RAG, and local models on llama.cpp. For backend and cloud it's Azure (Service Fabric, Cosmos DB), Redis, Node.js, and Docker, and on the web it's Next.js, React, and Tailwind ^_^",
  ],
  [
    "Tell me about Jarvis",
    "Jarvis is a personal side project: a voice AI dispatch agent for a demo freight app. You place a call and it looks up loads, assigns carriers, negotiates freight rates, and submits quotes while you talk. It uses an LLM planner with MCP tools and RAG over load and carrier data. The frontend streams 16 kHz PCM from an AudioWorklet to a Node.js backend over a long-lived WebSocket, and the call stays up as you move between pages. Live demo at jarvis.whoisdhruv.com, code at github.com/Dhruv-Mishra/AudioControlledAgenticWebsite. Want me to pull up the project card?",
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
    "A few favorites: Invoke, a voice assistant that hands coding tasks to Copilot CLI agents; Jarvis, a voice dispatch agent that negotiates freight rates; this portfolio and its live voice agent; Cropio, an AI portrait cropper; Fluent UI Android; and my Counting Bloom Filter research. The projects page has the full wall ~",
  ],
  [
    "How does Cropio work?",
    "Cropio is a portrait-cropping tool built around fast, face-aware framing. The point is to get clean social/profile-ready crops without manually dragging boxes forever: upload an image, let the model find a sensible crop around the face, then export the result. It is practical AI, less magic wand and more useful little production tool ~",
  ],
  [
    "Tell me about your time at IIIT Delhi",
    "I did Computer Science and Applied Mathematics at IIIT Delhi and graduated with Honors and an 8.96 CGPA. I spent a lot of time on competitive programming, and did research at the Distributed Computing Lab on lock-free Counting Bloom Filters. Good mix of theory, engineering, and getting humbled by hard problems.",
  ],
  [
    "What's your favorite language?",
    "C++ is still the favorite. It is sharp, occasionally rude, and very honest about performance. For day-to-day work I use TypeScript, C++, C#, Kotlin, Python, SQL, Java, and JavaScript depending on the problem, but C++ is the language that taught me to care about what the machine is actually doing.",
  ],
  [
    "How did you get into competitive programming?",
    "Competitive programming started as curiosity and turned into a very effective way to train problem-solving under pressure. I reached Codeforces Expert at 1703 and CodeChef 5-star at 2003, with a few fun contest results like global rank 291 in Google Code Jam 2023 Round A. It taught me to be fast, precise, and deeply suspicious of edge cases.",
  ],
  [
    "What do you enjoy most about your work?",
    "I like building agents that do real work for people, then making the systems under them fast and cheap enough to run all day. The incident-triage agents at Microsoft are a good example: the fun part is the agent, but most of the work is the tools, the fallbacks, and proving it actually saves on-call time.",
  ],
  [
    "Tell me about your research",
    "My undergraduate research was at IIIT Delhi's Distributed Computing Lab under Prof. Bapi Chatterjee, on relaxed concurrent Counting Bloom Filters. I built a lock-free C++ Counting Bloom Filter that got 3x the baseline throughput under high contention while keeping false positive and false negative rates close to the strict version. Very systems-y, very satisfying.",
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
