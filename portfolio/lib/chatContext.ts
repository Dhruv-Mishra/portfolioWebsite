// lib/chatContext.ts — Client-safe chat constants (NO system prompt — that's in chatContext.server.ts)

export const WELCOME_MESSAGE = "Hey :) Ask me about my work at Microsoft, my projects, tech stack, or competitive programming. I'll answer as if we're passing notes in class ~";

// Friendly fallback messages when the LLM is unavailable (shown as AI notes, not errors)
export const FALLBACK_MESSAGES = [
  "Looks like I dropped my pen ~! While I find it, check out my resume, projects, or about page — all the good stuff is there!",
  "My notepad got a bit jammed :/ In the meantime, you can browse my projects or read more about me on the other pages.",
  "Seems like the note didn't make it across the classroom >_< Try again in a sec, or feel free to explore my resume and projects.",
];

export const CHAT_CONFIG = {
  maxTokens: 256,       // Tight sticky-note responses — matches terse persona
  temperature: 0.6,     // Slightly lower for more reliable action-tag compliance
  topP: 0.9,
  maxStoredMessages: 50,
  maxConversationTurns: 20, // Max user messages before suggesting to explore other pages
  maxUserMessageLength: 500, // Max characters per user message
  responseTimeoutMs: 30_000, // Client-side timeout: abort fetch after 30s of no completion
  storageKey: 'dhruv-chat-history',
  miniChatDismissedKey: 'dhruv-minichat-dismissed',
} as const;
