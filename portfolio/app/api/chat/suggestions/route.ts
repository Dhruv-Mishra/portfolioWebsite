// app/api/chat/suggestions/route.ts — Generate contextual follow-up suggestions via LLM
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const SUGGESTIONS_SYSTEM_PROMPT = `You generate 2 short follow-up suggestions that a VISITOR (the user) might click next in a conversation with Dhruv Mishra's portfolio chatbot. The chatbot answers as Dhruv — a Software Engineer at Microsoft working on Fluent UI Android.

CRITICAL: Suggestions are written FROM THE USER'S PERSPECTIVE, addressed TO Dhruv. The user is talking to Dhruv, so use "you/your" (meaning Dhruv), never "my/I" (that would be Dhruv speaking).
- CORRECT: "Open your GitHub profile" (user asking to see Dhruv's GitHub)
- WRONG:  "Open my GitHub to see projects" (sounds like Dhruv talking about himself)
- CORRECT: "Tell me about your research"
- WRONG:  "Tell me about my research"

Available action types the user can trigger:
- Navigate to pages: home, about, projects, resume, chat
- Open links: GitHub, LinkedIn, Codeforces, email, resume PDF, project repos
- Toggle theme (dark/light)
- Report a bug / give feedback

Rules:
1. Return EXACTLY 2 suggestions, one per line. Nothing else — no numbering, no bullets, no quotes.
2. Each suggestion must be 2-8 words, conversational and casual.
3. One should be a conversational question about Dhruv's work/projects/skills.
4. The other should hint at an action (navigate, open link, toggle theme, etc.).
5. Don't repeat anything the user already asked.
6. Make them contextually relevant to the conversation so far.
7. Vary the suggestions — don't always suggest the same actions.
8. Always write from the user's voice — "you/your" refers to Dhruv.`;

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

      // Parse: expect 2 lines, one suggestion each
      const suggestions = raw
        .split('\n')
        .map((s: string) => s.replace(/^[\d.\-*)\s]+/, '').replace(/^["']|["']$/g, '').trim())
        .filter((s: string) => s.length >= 3 && s.length <= 60)
        .slice(0, 2);

      return Response.json({ suggestions }, {
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
