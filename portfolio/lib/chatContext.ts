// lib/chatContext.ts — Client-safe chat constants (NO system prompt — that's in chatContext.server.ts)
import { LLM_CLIENT_TIMEOUT_MS } from '@/lib/llmConfig';
import { pickRandom } from '@/lib/utils';

export const WELCOME_MESSAGE = "Hey :) Ask me about my AI work, Microsoft, projects, tech opinions, hobbies, or anything really ~";

// Generic fallback messages when no keyword match is found
const GENERIC_FALLBACKS = [
  "Hmm, something went wrong on my end — try again in a sec! Meanwhile, feel free to check out my projects or resume ~",
  "My pen ran out of ink :/ Give it another shot, or browse around — there's plenty to explore!",
  "Looks like that note got lost in transit. Try again, or head over to my projects and about pages!",
  "Hit a snag there — sorry about that! Ask me again, or explore the site while I sort things out.",
  "Well, that didn't work as planned. One more try? Or check out my resume and projects in the meantime!",
];

// Contextual fallback pools — matched against user prompt keywords via regex.
// Keywords are auto-compiled to regex. Each message leads with a "caught off guard"
// feel, gives a real nugget, then redirects.
// All facts sourced from the server-side fact bank and prompt builder.
interface ContextualFallback {
  keywords: string[];
  messages: string[];
}

const CONTEXTUAL_FALLBACK_DEFS: ContextualFallback[] = [
  {
    keywords: ['project', 'portfolio', 'work', 'built', 'shipped', 'microsoft'],
    messages: [
      "Got a bit scrambled there — I've built Jarvis (a voice-to-voice AI agent), Cropio as an AI portrait cropper, this AI-powered portfolio, and Bloom Filter research with a 300% throughput gain. Projects page has the full list!",
      "Sorry, lost my thread for a sec. I've built AI tools, an NLP course evaluator, a contactless vital-checkup system with OpenCV, a hybrid movie recommender, and more — check the projects page ~",
      "My notes got mixed up. At Microsoft I work across production software, performance engineering, and reliable infrastructure; side projects go deeper into AI agents and tooling. Projects page has the broader list!",
    ],
  },
  {
    keywords: ['resume', 'cv', 'experience', 'education', 'skills', 'background', 'hire', 'hiring'],
    messages: [
      "A little foggy right now — but quick version: Microsoft Software Engineer working across AI-forward software and production systems, FHL winner, IIIT Delhi 8.96 GPA. Resume page has the rest!",
      "Bit scattered, sorry. I'm at Microsoft working across performance-critical software, reliable infrastructure, and production systems at 7B+ daily-hit scale. The resume page has the details ~",
      "Brain glitch there. IIIT Delhi CS & Applied Math grad, Codeforces Expert (max 1703), Code Jam Global Rank 291, currently at Microsoft — resume page has it all!",
    ],
  },
  {
    keywords: ['tech', 'stack', 'react', 'nextjs', 'typescript', 'rust', 'programming', 'coding', 'language', 'framework'],
    messages: [
      "Got a bit turned around — I use TypeScript, Python, C#, C++, Kotlin, Java, SQL, JavaScript, KQL, C, Bash, and PowerShell. This site runs Next.js 16 + Tailwind v4. Ask me again!",
      "Head's in a muddle. My stack includes AI agents, LLM tooling, React, Next.js, Git, cloud infrastructure, CI/CD, NPM, and mobile platform work when the problem calls for it. Try again in a sec!",
      "Lost the thread there. My stack spans AI tooling, production systems, distributed systems, data structures, databases, and ML. Give it another shot ~",
    ],
  },
  {
    keywords: ['hobbies', 'free time', 'outside work', 'about you', 'yourself', 'who are you'],
    messages: [
      "Got a bit distracted. I'm into gym, chess, gaming, longevity research, and PC hardware rabbit holes. The about page has the full story!",
      "Sorry, thoughts went sideways. I was Immortal 2 in Valorant, play modded Minecraft on Azure, and love Witcher 3. Traveled to EU, Singapore, Vietnam, US too — about page has more ~",
      "Mind blanked for a sec. I'm into gym, chess, gaming, longevity research, and PC hardware rabbit holes. More on the about page!",
    ],
  },
  {
    keywords: ['email', 'linkedin', 'twitter', 'github', 'contact', 'reach', 'socials', 'links'],
    messages: [
      "Got a bit jumbled — you can reach me at dhruvmishra.id@gmail.com, or find me on LinkedIn and GitHub (Dhruv-Mishra). All in the sidebar!",
      "Sorry, lost my place. I'm on GitHub (Dhruv-Mishra), LinkedIn, and Codeforces (DhruvMishra, Expert, max 1703). Social sidebar has the links →",
      "Brain tripped for a sec. Email's dhruvmishra.id@gmail.com, phone is +91-9599377944, or hit up my LinkedIn — sidebar has everything!",
    ],
  },
];

// Auto-generate regex from keyword lists
const CONTEXTUAL_FALLBACKS = CONTEXTUAL_FALLBACK_DEFS.map(({ keywords, messages }) => ({
  pattern: new RegExp(`\\b(${keywords.join('|')})`, 'i'),
  messages,
}));

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
  // Bounds the legacy fallback provider's reply. Still well above the 20-70
  // word target from STYLE_BLOCK, but low enough to discourage rambling.
  // Mirrors the Groq primary provider's max_completion_tokens; keep in lockstep.
  maxTokens: 400,
  // Sharp but not deterministic. Lower than the prior 0.6 felt flat;
  // 0.7 + topP 0.9 matches the primary Groq sampling for behavior parity.
  temperature: 0.7,
  topP: 0.9,
  maxStoredMessages: 50,
  maxUserMessageLength: 500, // Max characters per user message
  responseTimeoutMs: LLM_CLIENT_TIMEOUT_MS, // Client-side timeout: abort fetch after this duration
  /**
   * Timeout for the follow-up suggestions fetch. Shorter than the main chat
   * timeout because suggestions are decorative — if they don't arrive in 8s the
   * user has almost certainly moved on, and a hanging request would otherwise
   * keep the loading spinner alive indefinitely on poor connections.
   */
  suggestionsTimeoutMs: 8000,
  storageKey: 'dhruv-chat-history',
  suggestionsStorageKey: 'dhruv-chat-suggestions',
} as const;
