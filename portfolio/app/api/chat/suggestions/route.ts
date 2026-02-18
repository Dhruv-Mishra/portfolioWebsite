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

DIVERSITY (critical):
- The two suggestions MUST be meaningfully different from each other. Never rephrase the same idea twice.
- Each suggestion should lead the conversation in a distinct direction.
- BAD: "Tell me about your projects" / "What projects have you built?" (same topic, different wording)
- GOOD: "What was hardest about Fluent UI?" / "Open your GitHub profile" (different directions)

Rules:
1. Return EXACTLY 2 suggestions, one per line. Nothing else — no numbering, no bullets, no quotes.
2. Each suggestion must be 2-8 words, conversational and casual.
3. Make both suggestions directly relevant to the last assistant message.
4. Don't repeat anything the user already asked or that was already covered.
5. The two suggestions must explore DIFFERENT aspects or offer DIFFERENT actions.
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

    // Suggestions use a dedicated model if configured (LLM_SUGGESTIONS_MODEL),
    // otherwise fall back to primary → fallback provider chain.
    // Speed is the priority here — use a fast, lightweight model.
    const suggestionsModel = process.env.LLM_SUGGESTIONS_MODEL;
    const suggestionsBaseURL = process.env.LLM_SUGGESTIONS_BASE_URL || process.env.LLM_BASE_URL;
    const suggestionsApiKey = process.env.LLM_SUGGESTIONS_API_KEY || process.env.LLM_API_KEY;

    const providers = [
      // Dedicated suggestions model (fast/lightweight) — first priority
      ...(suggestionsModel && suggestionsBaseURL && suggestionsApiKey
        ? [{ apiKey: suggestionsApiKey, baseURL: suggestionsBaseURL, model: suggestionsModel, timeoutMs: 8_000 }]
        : []),
      // Fallback to primary/fallback chain
      { apiKey: process.env.LLM_API_KEY, baseURL: process.env.LLM_BASE_URL, model: process.env.LLM_MODEL, timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 20_000 },
      { apiKey: process.env.LLM_FALLBACK_API_KEY, baseURL: process.env.LLM_FALLBACK_BASE_URL, model: process.env.LLM_FALLBACK_MODEL, timeoutMs: Number(process.env.LLM_FALLBACK_TIMEOUT_MS) || 25_000 },
    ].filter(p => p.apiKey && p.baseURL && p.model);

    if (providers.length === 0) {
      return Response.json({ suggestions: [] });
    }

    let raw = '';
    for (const provider of providers) {
      const controller = new AbortController();
      // Suggestions get a shorter timeout than chat
      const timeout = setTimeout(() => controller.abort(), Math.min(provider.timeoutMs, PROVIDER_TIMEOUT_MS));

      try {
        const llmResponse = await fetch(`${provider.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            model: provider.model,
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
          console.warn(`Suggestions: ${provider.model} responded ${llmResponse.status}`);
          continue; // try next provider
        }

        const data = await llmResponse.json();
        // Use content only — ignore reasoning_content (GLM5)
        raw = data.choices?.[0]?.message?.content || '';
        if (raw) break; // got a response, stop trying
      } catch (err) {
        clearTimeout(timeout);
        console.warn(`Suggestions: ${provider.model} failed:`, (err as Error)?.message);
        continue; // try next provider
      }
    }

    if (!raw) {
      return Response.json({ suggestions: [] });
    }

    {
      // Parse: expect 2 lines, one suggestion each
      const suggestions = raw
        .split('\n')
        .map((s: string) => s.replace(/^\[ACTION\]\s*/i, '').replace(/^[\d.\-*)\s]+/, '').replace(/^["']|["']$/g, '').trim())
        .filter((s: string) => s.length >= 3 && s.length <= 60)
        .slice(0, 2);

      return Response.json({ suggestions }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  } catch {
    return Response.json({ suggestions: [] });
  }
}
