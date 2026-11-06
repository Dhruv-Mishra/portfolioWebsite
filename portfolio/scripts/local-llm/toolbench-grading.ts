import { parseSiteToolCall } from '@/lib/siteToolValidation';
import type { CallSpec, ChatCheck, ToolExpect } from './toolbench-cases';

export interface ToolCall { name: string; args: Record<string, unknown> | null }

function matchesArg(check: unknown, value: unknown): boolean {
  if (typeof check === 'function') return Boolean(check(value));
  return value === check;
}

function matchesSpec(spec: CallSpec, call: ToolCall): boolean {
  return Object.entries(spec.args ?? {}).every(([key, check]) => matchesArg(check, call.args?.[key]));
}

export function describeCalls(calls: ToolCall[]): string {
  return calls.length ? calls.map(call => `${call.name}(${JSON.stringify(call.args)})`).join(', ') : 'none';
}

export function gradeTools(calls: ToolCall[], expect: ToolExpect): string | null {
  if (expect.anyOf) {
    const failures = expect.anyOf.map(option => gradeTools(calls, option));
    return failures.includes(null) ? null : failures.join(' | ');
  }
  if (calls.some(call => call.args === null)) return 'invalid tool arguments';
  if (calls.some(call => !parseSiteToolCall({ name: call.name, args: call.args }))) return 'tool call rejected by production validator';
  if (expect.none) return calls.length === 0 ? null : `expected no call, got ${describeCalls(calls)}`;
  const remaining = [...calls];
  for (const spec of expect.calls ?? []) {
    const index = remaining.findIndex(call => call.name === spec.name && matchesSpec(spec, call));
    if (index < 0) return `missing ${spec.name}${spec.args ? ` ${JSON.stringify(spec.args, (_, value) => (typeof value === 'function' ? '<check>' : value))}` : ''}; got ${describeCalls(calls)}`;
    remaining.splice(index, 1);
  }
  const extra = remaining.filter(call => !expect.allowExtra?.includes(call.name));
  return extra.length ? `unexpected ${describeCalls(extra)}` : null;
}

export function gradeChat(text: string, check: ChatCheck, defaultMaxWords: number): string | null {
  const found = (needle: string | RegExp) => typeof needle === 'string'
    ? text.toLowerCase().includes(needle.toLowerCase()) : needle.test(text);
  if (!text.trim()) return 'empty reply';
  if (check.includesAny && !check.includesAny.some(found)) return `missing any of ${check.includesAny.join(', ')}`;
  const missing = check.includesAll?.filter(needle => !found(needle));
  if (missing?.length) return `missing required ${missing.join(', ')}`;
  if (check.includesSome && check.includesSome.of.filter(found).length < check.includesSome.min) return `needs ${check.includesSome.min} of ${check.includesSome.of.join(', ')}`;
  const banned = [...(check.excludes ?? []), /\bas an ai\b|\blanguage model\b/i, /^\s*(?:#+\s|[-*•]\s|\d+\.\s)/m, /```|\*\*/, /https?:\/\//i, /<\/?(think|tool_call)>/i].find(pattern => pattern.test(text));
  if (banned) return `matched banned ${banned}`;
  const words = text.trim().split(/\s+/).length;
  const maxWords = check.maxWords ?? defaultMaxWords;
  return words > maxWords ? `too long (${words} > ${maxWords} words)` : null;
}