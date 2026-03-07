const TOOL_NAMES = [
  'navigate_internal',
  'open_known_link',
  'open_feedback_modal',
  'open_project_modal',
  'switch_theme',
] as const;

const TRAILING_TOOL_ARTIFACT_PATTERNS = [
  /\n*```(?:json)?\s*[\s\S]*?"(?:name|parameters|arguments|tool_calls?)"[\s\S]*?```\s*$/i,
  /\n*\{[\s\S]*?"(?:name|parameters|arguments|tool_calls?)"[\s\S]*\}\s*$/i,
  /\n*(?:calling\s+tool|tool\s*call|function\s*call)[:\s-]*[\s\S]*$/i,
  /\n*(?:navigate_internal|open_known_link|open_feedback_modal|open_project_modal|switch_theme)\b[\s\S]*$/i,
  /\n*[A-Za-z_][A-Za-z0-9_]*\s*\(\s*\{[\s\S]*\}\s*\)\s*$/i,
] as const;

function normalizeComparableText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeSuggestionLine(line: string): string {
  return line
    .replace(/^\[ACTION\]\s*/i, '')
    .replace(/^[\d.\-*)\s]+/, '')
    .replace(/^[-*•]\s*/, '')
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

export function looksLikeToolArtifact(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (/^```(?:json)?/i.test(trimmed) && /"(?:name|parameters|arguments|tool_calls?)"/i.test(trimmed)) {
    return true;
  }

  if (/^[\[{]/.test(trimmed) && /"(?:name|parameters|arguments|tool_calls?)"/i.test(trimmed)) {
    return true;
  }

  if (/\b(?:calling\s+tool|tool\s*call|function\s*call)\b/i.test(trimmed)) {
    return true;
  }

  return TOOL_NAMES.some(toolName => trimmed.includes(toolName));
}

export function sanitizeAssistantReplyText(text: string): string {
  let sanitized = text.trim();

  for (let index = 0; index < 4; index++) {
    const next = TRAILING_TOOL_ARTIFACT_PATTERNS.reduce(
      (current, pattern) => current.replace(pattern, '').trimEnd(),
      sanitized,
    ).trim();

    if (next === sanitized) {
      break;
    }

    sanitized = next;
  }

  const trailingArtifactIndex = sanitized.search(/\s+(?:\{\s*"name"\s*:|```(?:json)?|calling\s+tool|tool\s*call|function\s*call|navigate_internal|open_known_link|open_feedback_modal|open_project_modal|switch_theme)/i);
  if (trailingArtifactIndex !== -1) {
    sanitized = sanitized.slice(0, trailingArtifactIndex).trimEnd();
  }

  if (looksLikeToolArtifact(sanitized)) {
    return '';
  }

  return sanitized;
}

export function parseSuggestionResponse(
  rawText: string,
  context: { recentUserMessage?: string; recentAssistantMessage?: string } = {},
): string[] {
  const recentUser = normalizeComparableText(context.recentUserMessage ?? '');
  const recentAssistant = normalizeComparableText(context.recentAssistantMessage ?? '');
  const seen = new Set<string>();

  const suggestions = rawText
    .split('\n')
    .map(normalizeSuggestionLine)
    .filter(suggestion => suggestion.length >= 3 && suggestion.length <= 60)
    .filter(suggestion => !looksLikeToolArtifact(suggestion))
    .filter(suggestion => !/[{}\[\]`]/.test(suggestion))
    .filter(suggestion => {
      const words = suggestion.split(/\s+/).filter(Boolean);
      return words.length >= 2 && words.length <= 8;
    })
    .filter(suggestion => {
      const normalized = normalizeComparableText(suggestion);
      if (!normalized || normalized === recentUser || normalized === recentAssistant) {
        return false;
      }

      if (seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    })
    .slice(0, 2);

  return suggestions.length === 2 ? suggestions : [];
}