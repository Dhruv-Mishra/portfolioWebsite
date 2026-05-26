// lib/suggestionResponses.ts — Pregenerated canned replies for the
// pre-baked initial suggestion chips on the chat page.
//
// When the user clicks one of the EXACT suggestion strings as their FIRST
// message in a session, we short-circuit the /api/chat round-trip and
// return the canned reply locally. This eliminates a network hop on the
// most common cold-start path and keeps the model from inventing details
// when it lacks context.
//
// Action-bearing suggestions (e.g. "Report a bug") are intentionally NOT
// in this map — those still flow through the existing action router so
// the side-effect (open feedback modal, navigate, etc.) fires.

const RESPONSES: ReadonlyMap<string, string> = new Map([
  [
    "What do you work on at Microsoft?",
    "I'm a Software Engineer at Microsoft, working across Android and backend platforms used by millions of people. Day to day that means profiling cold starts, tuning UI pipelines, fixing scaling bottlenecks, and shaving real milliseconds off systems where every ms matters. Less glamorous than it sounds, more satisfying than it looks ~",
  ],
  [
    "What's your tech stack?",
    "Daily drivers: TypeScript, C#, Kotlin, Python, and a healthy amount of C++ when I'm in CP mode. On the web side I lean on Next.js, React, Tailwind, and Framer Motion (this site is the proof). Backend leans Node.js, MySQL, and Azure. For Android: Jetpack Compose with Hilt for DI. I care more about choosing the right tool than collecting them ^_^",
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
]);

/**
 * Look up a pre-baked response for an EXACT initial-suggestion string.
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
