// app/api/chat/suggestions/route.ts — Generate contextual follow-up suggestions via LLM
import { NextRequest } from 'next/server';
import { LLM_SUGGESTIONS_TIMEOUT_MS, RATE_LIMIT_CONFIG, LLM_SUGGESTIONS_PARAMS, isRawLogEnabled, stripThinkTags } from '@/lib/llmConfig';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { validateOrigin } from '@/lib/validateOrigin';

export const runtime = 'nodejs';

const suggestionsRateLimiter = createServerRateLimiter({ ...RATE_LIMIT_CONFIG.suggestions, maxTrackedIPs: 500, cleanupInterval: 50 });

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



export async function POST(request: NextRequest) {
  try {
    // Block cross-origin requests
    const originError = validateOrigin(request);
    if (originError) return originError;

    const ip = getClientIP(request);
    const { limited, retryAfter } = suggestionsRateLimiter.check(ip);
    if (limited) {
      return Response.json({ suggestions: [] }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
    }

    const body = await request.json();
    const messages: { role: string; content: string }[] = body.messages || [];

    // Take last 4 messages for context (lightweight)
    const context = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 300) }))
      .slice(-4);

    const apiKey = process.env.LLM_API_KEY;
    const baseURL = process.env.LLM_BASE_URL;
    const model = process.env.LLM_SUGGESTIONS_MODEL || process.env.LLM_MODEL;

    if (!apiKey || !baseURL || !model) {
      return Response.json({ suggestions: [] });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LLM_SUGGESTIONS_TIMEOUT_MS);

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
          temperature: LLM_SUGGESTIONS_PARAMS.temperature,
          top_p: LLM_SUGGESTIONS_PARAMS.topP,
          max_tokens: LLM_SUGGESTIONS_PARAMS.maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!llmResponse.ok) {
        return Response.json({ suggestions: [] });
      }

      const data = await llmResponse.json();
      const rawContent = data.choices?.[0]?.message?.content || '';
      const raw = stripThinkTags(rawContent);

      if (isRawLogEnabled()) {
        const thinking = rawContent !== raw ? rawContent.match(/<think>([\s\S]*?)<\/think>/i)?.[1]?.trim() : undefined;
        console.log('[SUGGESTIONS RAW]', { model, raw: rawContent, clean: raw, ...(thinking ? { thinking } : {}) });
      }

      // Parse: expect 2 lines, one suggestion each
      const suggestions = raw
        .split('\n')
        .map((s: string) => s.replace(/^\[ACTION\]\s*/i, '').replace(/^[\d.\-*)\s]+/, '').replace(/^["']|["']$/g, '').trim())
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
