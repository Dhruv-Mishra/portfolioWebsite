// lib/chatContext.ts — Client-safe chat constants (NO system prompt — that's in chatContext.server.ts)

export const WELCOME_MESSAGE = "Hey :) Ask me about my work at Microsoft, my projects, tech opinions, hobbies, or anything really ~";

// Generic fallback messages when no keyword match is found
const GENERIC_FALLBACKS = [
  "Hmm, something went wrong on my end — try again in a sec! Meanwhile, feel free to check out my projects or resume ~",
  "My pen ran out of ink :/ Give it another shot, or browse around — there's plenty to explore!",
  "Looks like that note got lost in transit. Try again, or head over to my projects and about pages!",
  "Hit a snag there — sorry about that! Ask me again, or explore the site while I sort things out.",
  "Well, that didn't work as planned. One more try? Or check out my resume and projects in the meantime!",
];

// Contextual fallback pools — matched against user prompt keywords via regex.
// Patterns are intentionally narrow (word boundaries, multi-word phrases) so most
// prompts fall through to GENERIC_FALLBACKS. Only clearly topical questions match.
// Each message leads with a "caught off guard" feel, gives a real nugget, then redirects.
// All facts sourced from DHRUV_SYSTEM_PROMPT in chatContext.server.ts.
const CONTEXTUAL_FALLBACKS: { pattern: RegExp; messages: string[] }[] = [
  {
    pattern: /\bprojects?\b|(?:your|dhruv'?s)\s+(?:portfolio|work)|(?:built|shipped|made)\s+(?:any|what)|microsoft\s+(?:work|intern|project)/i,
    messages: [
      "Got a bit scrambled there — I've worked on Fluent UI Android (ships in Outlook/Teams), did Bloom Filter research with a 300% throughput gain, and built this site. Projects page has the full list!",
      "Sorry, lost my thread for a sec. I've built an NLP course evaluator, a vital-checkup app with OpenCV, a hybrid movie recommender, and more — check the projects page ~",
      "My notes got mixed up. At Microsoft I shipped Fluent UI Android and M365 Shell encryption at 7B+ hits/day — the projects page has everything!",
    ],
  },
  {
    pattern: /\bresume\b|\bcv\b|(?:your|dhruv'?s)\s+(?:experience|education|skills|background)|(?:hire|hiring)\s+(?:you|dhruv)/i,
    messages: [
      "A little foggy right now — but quick version: Microsoft M365 Shell Team, cut infra COGS by $240K/year, FHL hackathon winner. IIIT Delhi, 8.96 GPA. Resume page has the rest!",
      "Bit scattered, sorry. I'm at Microsoft doing C++/C# at 7B+ hits/day scale, previously shipped Fluent UI Android. The resume page has the details ~",
      "Brain glitch there. IIIT Delhi CS & Applied Math grad, Codeforces Expert (max 1703), Code Jam Global Rank 291, currently at Microsoft — resume page has it all!",
    ],
  },
  {
    pattern: /\b(?:tech\s*stack|react|next\.?js|typescript|rust)\b|(?:programming|coding)\s+(?:language|experience)|(?:what|which)\s+(?:languages?|frameworks?)\b/i,
    messages: [
      "Got a bit turned around — I use C++ and C# at Microsoft, Python/TypeScript on the side, and did a lot of Kotlin/Android (Compose, Hilt) before. This site runs Next.js 16 + Tailwind v4. Ask me again!",
      "Head's in a muddle. C++ is my favorite — also fluent in C#, TypeScript, Python, Java, and Kotlin. Comfortable with Azure, MySQL, and distributed systems. Try again in a sec!",
      "Lost the thread there. My stack is C++/C# at work, Next.js + TypeScript for web, Python for ML, and previously a lot of Kotlin for Android. Give it another shot ~",
    ],
  },
  {
    pattern: /\bhobbies\b|\bfree\s*time\b|(?:outside|beyond)\s+(?:work|coding)|(?:who\s+(?:are|is)\s+(?:you|dhruv))|(?:about\s+(?:you|yourself|dhruv))\b/i,
    messages: [
      "Got a bit distracted — I'm into gym, chess, and PC overclocking (3080 Ti, 5.5GHz i5, DDR5 tuned to 6400MHz). The about page has the full story!",
      "Sorry, thoughts went sideways. I was Immortal 2 in Valorant, play modded Minecraft on Azure, and love Witcher 3. Traveled to EU, Singapore, Vietnam, US too — about page has more ~",
      "Mind blanked for a sec. I'm into gym, chess, gaming, longevity research, and PC hardware rabbit holes. More on the about page!",
    ],
  },
  {
    pattern: /\b(?:email|linkedin|twitter|github)\b|(?:contact|reach|get\s*in\s*touch\s*with)\s+(?:you|dhruv)|(?:your|dhruv'?s)\s+(?:socials?|links?)\b/i,
    messages: [
      "Got a bit jumbled — you can reach me at dhruvmishra.id@gmail.com, or find me on LinkedIn and GitHub (Dhruv-Mishra). All in the sidebar!",
      "Sorry, lost my place. I'm on GitHub (Dhruv-Mishra), LinkedIn, and Codeforces (DhruvMishra, Expert, max 1703). Social sidebar has the links →",
      "Brain tripped for a sec. Email's dhruvmishra.id@gmail.com, phone is +91-9599377944, or hit up my LinkedIn — sidebar has everything!",
    ],
  },
];

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Returns a fallback message contextual to the user's prompt.
 * Matches keywords via regex; falls back to a generic pool if nothing matches.
 */
export function getContextualFallback(userPrompt: string): string {
  for (const { pattern, messages } of CONTEXTUAL_FALLBACKS) {
    if (pattern.test(userPrompt)) {
      return pickRandom(messages);
    }
  }
  return pickRandom(GENERIC_FALLBACKS);
}

export const CHAT_CONFIG = {
  maxTokens: 256,       // Tight sticky-note responses — matches terse persona
  temperature: 0.6,     // Slightly lower for more reliable action-tag compliance
  topP: 0.9,
  maxStoredMessages: 50,
  maxUserMessageLength: 500, // Max characters per user message
  responseTimeoutMs: 30_000, // Client-side timeout: abort fetch after 30s of no completion
  storageKey: 'dhruv-chat-history',
  suggestionsStorageKey: 'dhruv-chat-suggestions',
  miniChatDismissedKey: 'dhruv-minichat-dismissed',
} as const;
