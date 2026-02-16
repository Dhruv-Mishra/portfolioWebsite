// app/api/chat/suggestions/route.ts — Generate contextual follow-up suggestions via LLM
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const SUGGESTIONS_SYSTEM_PROMPT = `You generate 2 short follow-up suggestions that a VISITOR (the user) might click next in a conversation with Dhruv Mishra's portfolio chatbot. The chatbot answers as Dhruv — a Software Engineer at Microsoft working on Fluent UI Android.

CRITICAL: Suggestions are written FROM THE USER'S PERSPECTIVE, addressed TO Dhruv. The user is talking to Dhruv, so use "you/your" (meaning Dhruv), never "my/I" (that would be Dhruv speaking).
- CORRECT: "Open your GitHub profile" (user asking to see Dhruv's GitHub)
- WRONG:  "Open my GitHub to see projects" (sounds like Dhruv talking about himself)

Available action types the user can trigger:
- Navigate to pages: home, about, projects, resume, chat
- Open links: GitHub, LinkedIn, Codeforces, email, resume PDF, project repos
- Toggle theme (dark/light)
- Report a bug / give feedback

CONTEXT-AWARENESS (most important):
- Read the LAST assistant message carefully. Your suggestions must be a DIRECT, logical follow-up to what was just said.
- If the assistant just ASKED A QUESTION or offered to do something ("Want me to open X?", "Should I take you to Y?", "Want details on Z?"), BOTH suggestions should be quick responses — one affirmative ("Yes please!", "Sure, open it!", "Yeah, show me!") and one decline/redirect ("Not right now", "Nah, tell me about X instead", "Maybe later"). Keep them short and natural.
- Don't repeat what the user asked in their MOST RECENT message. Earlier topics are fine to revisit if contextually relevant.
- Suggestions should dig DEEPER into what was just discussed, not restart the conversation. If Dhruv just explained Fluent UI, suggest something specific about Fluent UI — not a generic "What projects have you worked on?".

ACTION TAGGING (be strict!):
Only prefix a suggestion with [ACTION] if clicking it would DIRECTLY cause a visible side-effect: navigating to a different page, opening a URL/link, toggling the theme, or opening feedback. Affirmative confirmations to action offers also count (e.g. "[ACTION] Sure, open it!").
Do NOT tag:
- Questions asking for information ("Tell me about X", "What's your experience with Y?")
- Conversational responses that don't trigger a navigation/link/theme change
- Declines or redirects ("Not right now", "Tell me about something else")
When in doubt, do NOT add the [ACTION] prefix.

Rules:
1. Return EXACTLY 2 suggestions, one per line. Nothing else — no numbering, no bullets, no quotes.
2. Each suggestion must be 2-8 words, conversational and casual (the [ACTION] prefix does NOT count toward the word limit).
3. Make both suggestions directly relevant to the last assistant message.
4. Don't repeat anything the user already asked or that was already covered.
5. Vary the suggestions — don't always suggest the same actions.
6. Always write from the user's voice — "you/your" refers to Dhruv.`;

const PROVIDER_TIMEOUT_MS = 8_000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messages: { role: string; content: string }[] = body.messages || [];

    // Take last 4 messages for context (lightweight)
    const context = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 300) }))
      .slice(-4);

    const apiKey = process.env.LLM_API_KEY;
    const baseURL = process.env.LLM_BASE_URL;
    const model = process.env.LLM_MODEL;

    if (!apiKey || !baseURL || !model) {
      return Response.json({ suggestions: [] });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

    try {
      const llmResponse = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SUGGESTIONS_SYSTEM_PROMPT },
            ...context,
            { role: 'user', content: 'Generate 2 follow-up suggestions for the user.' },
          ],
          temperature: 0.9,
          top_p: 0.95,
          max_tokens: 80,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!llmResponse.ok) {
        return Response.json({ suggestions: [] });
      }

      const data = await llmResponse.json();
      const raw = data.choices?.[0]?.message?.content || '';

      // Parse: expect 2 lines, one suggestion each. Strip [ACTION] prefix and track which are actions.
      const ACTION_PREFIX = /^\[ACTION\]\s*/i;
      const actionSuggestions: string[] = [];
      const suggestions = raw
        .split('\n')
        .map((s: string) => s.replace(/^[\d.\-*)\s]+/, '').replace(/^["']|["']$/g, '').trim())
        .filter((s: string) => s.length >= 3 && s.length <= 80)
        .slice(0, 2)
        .map((s: string) => {
          if (ACTION_PREFIX.test(s)) {
            const cleaned = s.replace(ACTION_PREFIX, '').trim();
            actionSuggestions.push(cleaned);
            return cleaned;
          }
          return s;
        });

      return Response.json({ suggestions, actionSuggestions }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch {
      clearTimeout(timeout);
      return Response.json({ suggestions: [] });
    }
  } catch {
    return Response.json({ suggestions: [] });
  }
}
