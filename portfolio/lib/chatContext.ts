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
      "Got a bit scrambled there. I've built Invoke (voice-controlled coding agents), Jarvis (a voice dispatch agent), Cropio as an AI portrait cropper, and this site's voice agent. Projects page has the full list!",
      "Sorry, lost my thread for a sec. I've built AI tools, an NLP course evaluator, a contactless vital-checkup system with OpenCV, a hybrid movie recommender, and more. Check the projects page ~",
      "My notes got mixed up. At Microsoft I build production AI agents and the Azure backend services they run on; side projects go deeper into voice agents. Projects page has the broader list!",
    ],
  },
  {
    keywords: ['resume', 'cv', 'experience', 'education', 'skills', 'background', 'hire', 'hiring'],
    messages: [
      "A little foggy right now, but quick version: Software Engineer at Microsoft building AI agents and Azure backend services, Microsoft Hackathon winner, IIIT Delhi 8.96 GPA. Resume page has the rest!",
      "Bit scattered, sorry. I'm at Microsoft building incident-triage AI agents and backend services that handle 7B+ requests a day. The resume page has the details ~",
      "Brain glitch there. IIIT Delhi CS & Applied Math grad, Codeforces Expert (max 1703), Code Jam Global Rank 291, currently at Microsoft — resume page has it all!",
    ],
  },
  {
    keywords: ['tech', 'stack', 'react', 'nextjs', 'typescript', 'rust', 'programming', 'coding', 'language', 'framework'],
    messages: [
      "Got a bit turned around. I mostly use C#, TypeScript, and Python, plus C++, Kotlin, Java, and SQL. This site runs Next.js 16 + Tailwind v4. Ask me again!",
      "Head's in a muddle. My stack includes LLM agents, MCP, RAG, Azure, Redis, Node.js, React, Next.js, Docker, and Android when the problem calls for it. Try again in a sec!",
      "Lost the thread there. My stack spans AI agents, backend services, distributed systems, data structures, and ML. Give it another shot ~",
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
