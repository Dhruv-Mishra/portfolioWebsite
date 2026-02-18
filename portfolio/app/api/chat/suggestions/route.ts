// app/api/chat/suggestions/route.ts — Generate contextual follow-up suggestions via LLM
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const SUGGESTIONS_SYSTEM_PROMPT = `Generate 2 short follow-up suggestions a VISITOR would click next in a chat with Dhruv Mishra (SWE @ Microsoft). Written from visitor's perspective TO Dhruv — "you/your" = Dhruv, never "my/I".

Actions available: navigate (home/about/projects/resume/chat), open links (GitHub/LinkedIn/Codeforces/email/resume PDF/project repos), toggle theme, report bug/feedback.

CONTEXT: Suggestions must directly follow up the LAST assistant message. If assistant proposed an action ("Want me to open X?"), one suggestion = affirmative ("Yes please!"), one = decline/redirect ("Nah, tell me about Y instead"). Otherwise: dig deeper into what was just discussed, don't restart conversation. Never repeat the user's most recent question.

DIVERSITY: Two suggestions must lead in DISTINCT directions. Bad: same topic reworded. Good: one info-question + one action, or two different subtopics.

Output: EXACTLY 2 lines, no numbering/bullets/quotes. 2-8 words each, casual. Always from visitor voice.`;

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
      { apiKey: process.env.LLM_API_KEY, baseURL: process.env.LLM_BASE_URL, model: process.env.LLM_MODEL, timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 30_000 },
      { apiKey: process.env.LLM_FALLBACK_API_KEY, baseURL: process.env.LLM_FALLBACK_BASE_URL, model: process.env.LLM_FALLBACK_MODEL, timeoutMs: Number(process.env.LLM_FALLBACK_TIMEOUT_MS) || 30_000 },
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
