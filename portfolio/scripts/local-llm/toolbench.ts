// Tool-calling and grounded-chat benchmark for OpenAI-compatible llama.cpp endpoints.
// Run:     npx tsx --conditions=react-server scripts/local-llm/toolbench.ts --base http://127.0.0.1:8090/v1 --label NAME
// Compare: npx tsx scripts/local-llm/toolbench.ts --compare tmp/toolbench/a.json tmp/toolbench/b.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { CHAT_CASES, HARNESS_CASES, TOOL_CASES, type ChatCase, type HarnessCase, type Msg, type PageState, type ToolCase } from './toolbench-cases';
import { describeCalls, gradeChat, gradeTools, type ToolCall } from './toolbench-grading';
import { parseSiteToolCall } from '@/lib/siteToolValidation';
import { VOICE_LIVE_TOOL_DECLARATIONS } from '@/lib/siteToolDeclarations';
import { buildVoiceSystemInstruction } from '@/lib/voiceAgentPrompt';

process.env.EMBEDDINGS_MODE ??= 'local';

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: 'string', default: 'http://127.0.0.1:8090/v1' },
    key: { type: 'string', default: process.env.LOCAL_AGENT_API_KEY ?? '' },
    model: { type: 'string', default: 'bench' },
    label: { type: 'string' },
    suite: { type: 'string', default: 'tools,chat,harness' },
    layout: { type: 'string', default: 'local' },
    measure: { type: 'boolean', default: false },
    // off | on (template default effort) | low | high
    think: { type: 'string', default: 'off' },
    // Thinking token budget enforced by llama.cpp (-1 = unlimited).
    budget: { type: 'string', default: '-1' },
    'budget-msg': { type: 'string', default: '\nOkay, I have enough to answer now.\n' },
    repeat: { type: 'string', default: '1' },
    // 'all' puts every fact in the cached system prompt instead of retrieving per turn.
    facts: { type: 'string', default: 'retrieval' },
    temp: { type: 'string', default: '0' },
    'top-k': { type: 'string' },
    'top-p': { type: 'string' },
    'min-p': { type: 'string' },
    'repeat-penalty': { type: 'string' },
    filter: { type: 'string' },
    out: { type: 'string', default: 'tmp/toolbench' },
    compare: { type: 'boolean', default: false },
    verbose: { type: 'boolean', short: 'v', default: false },
  },
});

// ttfvMs: prompt time plus the decode time spent on hidden reasoning, i.e. when the first visible token would stream.
interface Timing { promptN: number; promptMs: number; cacheN: number; genN: number; genMs: number; wallMs: number; thinkN: number; ttfvMs: number; inputBytes: number; requests: number }
interface PromptSize { systemBytes: number; turnBytes: number; toolBytes: number; inputBytes: number }
type ChatLayout = 'local' | 'cloud' | 'browser';
interface CaseResult { id: string; category: string; pass: boolean; detail: string; output: string; timing: Timing; calls?: ToolCall[]; reply?: string; prompt?: PromptSize }
interface SuiteResult { pass: number; total: number; byCategory: Record<string, { pass: number; total: number }>; cases: CaseResult[]; context?: { reads: number; responseBytes: number } }
interface HarnessSize { tools: number; toolBytes: number; systemBytes: number }
interface BenchResult { label: string; base: string; think: string; budget: number; facts: string; sampling: Record<string, number>; serverModel: string; finishedAt: string; suites: Record<string, SuiteResult>; harnessSize?: HarnessSize; chatLayout?: ChatLayout }

const DEFAULT_STATE: PageState = { page: '/about', theme: 'light', disco: 'off', volume: 70, openProject: 'none' };
// Tools the chat surface would not expose: retrieval is already in the prompt and hangup is voice-only.
const EXCLUDED_TOOLS = new Set(['lookup_site_facts', 'get_recent_user_context', 'end_voice_session']);
const TURN_CONTEXT_HEADER = 'Your own notes for this reply (not written by the visitor; never mention them):';
const TURN_MESSAGE_HEADER = "Visitor's message:";
const MAX_WORDS = { brief: 30, standard: 60, detailed: 150 } as const;

function sampling(): Record<string, number> {
  const out: Record<string, number> = { temperature: Number(opts.temp) };
  if (opts['top-k']) out.top_k = Number(opts['top-k']);
  if (opts['top-p']) out.top_p = Number(opts['top-p']);
  if (opts['min-p']) out.min_p = Number(opts['min-p']);
  if (opts['repeat-penalty']) out.repeat_penalty = Number(opts['repeat-penalty']);
  return out;
}

const BUDGET = Number(opts.budget);
const THINKING = opts.think !== 'off';
const NO_TIMING: Timing = { promptN: 0, promptMs: 0, cacheN: 0, genN: 0, genMs: 0, wallMs: 0, thinkN: 0, ttfvMs: 0, inputBytes: 0, requests: 0 };

function thinkingBody(): Record<string, unknown> {
  if (!THINKING) return { chat_template_kwargs: { enable_thinking: false } };
  return {
    chat_template_kwargs: { enable_thinking: true, ...(opts.think === 'on' ? {} : { reasoning_effort: opts.think }) },
    ...(BUDGET >= 0 ? { reasoning_budget_tokens: BUDGET, reasoning_budget_message: opts['budget-msg'] } : {}),
  };
}

/** Output-token headroom for hidden reasoning on top of the visible reply cap. */
function thinkingHeadroom(): number {
  if (!THINKING) return 0;
  return BUDGET >= 0 ? BUDGET + 16 : 2048;
}

async function countTokens(text: string): Promise<number> {
  if (!text) return 0;
  const response = await fetch(`${opts.base.replace(/\/v1\/?$/, '')}/tokenize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.key ? { Authorization: `Bearer ${opts.key}` } : {}) },
    body: JSON.stringify({ content: text }),
  }).catch(() => null);
  if (!response?.ok) return Math.ceil(text.length / 4);
  return ((await response.json()) as { tokens?: unknown[] }).tokens?.length ?? 0;
}

interface CompletionMessage { content?: string | null; reasoning_content?: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }> }
interface Completion {
  choices?: Array<{ message?: CompletionMessage }>;
  usage?: { completion_tokens?: number; prompt_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  timings?: { prompt_n?: number; prompt_ms?: number; cache_n?: number; predicted_n?: number; predicted_ms?: number };
}

class ModelAccessError extends Error {}

async function complete(body: Record<string, unknown>): Promise<{ json: Completion; timing: Timing }> {
  const started = performance.now();
  const requestBody = JSON.stringify({ model: opts.model, stream: false, ...sampling(), ...thinkingBody(), ...body });
  const response = await fetch(`${opts.base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.key ? { Authorization: `Bearer ${opts.key}` } : {}) },
    body: requestBody,
    signal: AbortSignal.timeout(300_000),
  });
  const text = await response.text();
  if (!response.ok) {
    const message = `HTTP ${response.status}: ${text.slice(0, 300)}`;
    if (response.status === 401 || response.status === 403) throw new ModelAccessError(message);
    throw new Error(message);
  }
  const json = JSON.parse(text) as Completion;
  const wallMs = performance.now() - started;
  const t = json.timings ?? {};
  const genN = t.predicted_n ?? json.usage?.completion_tokens ?? 0;
  const genMs = t.predicted_ms ?? 0;
  const promptMs = t.prompt_ms ?? 0;
  const thinkN = Math.min(genN, await countTokens(json.choices?.[0]?.message?.reasoning_content ?? ''));
  return {
    json,
    timing: {
      promptN: t.prompt_n ?? json.usage?.prompt_tokens ?? 0,
      promptMs,
      cacheN: t.cache_n ?? json.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      genN,
      genMs,
      wallMs,
      thinkN,
      ttfvMs: promptMs + (genN ? (thinkN * genMs) / genN : 0),
      inputBytes: Buffer.byteLength(requestBody),
      requests: 1,
    },
  };
}

function withTurnContext(messages: Msg[], context: string): Msg[] {
  const last = messages.at(-1);
  if (!last || last.role !== 'user') return messages;
  return [...messages.slice(0, -1), { role: 'user', content: `${TURN_CONTEXT_HEADER}\n${context}\n\n${TURN_MESSAGE_HEADER}\n${last.content}` }];
}

function parseCalls(message: CompletionMessage | undefined): ToolCall[] {
  return (message?.tool_calls ?? []).map((call) => {
    const raw = call.function?.arguments;
    let args: Record<string, unknown> | null = null;
    try {
      args = typeof raw === 'string' ? (raw.trim() ? JSON.parse(raw) : {}) : ((raw as Record<string, unknown> | undefined) ?? {});
    } catch {
      args = null;
    }
    return { name: call.function?.name ?? '', args };
  });
}

function stateBlock(state: Partial<PageState> | undefined): string {
  const s = { ...DEFAULT_STATE, ...state };
  const readAloud = s.chatReadAloudVolume === undefined ? '' : `, chat read-aloud volume ${s.chatReadAloudVolume}%`;
  return `Page state: page ${s.page}, theme ${s.theme}, disco ${s.disco}, master volume ${s.volume}%${readAloud}, open project ${s.openProject}.`;
}

function summarize(cases: CaseResult[]): SuiteResult {
  const byCategory: SuiteResult['byCategory'] = {};
  for (const result of cases) {
    const bucket = (byCategory[result.category] ??= { pass: 0, total: 0 });
    bucket.total += 1;
    if (result.pass) bucket.pass += 1;
  }
  return { pass: cases.filter(c => c.pass).length, total: cases.length, byCategory, cases };
}

function logCase(result: CaseResult): void {
  const mark = result.pass ? 'PASS' : 'FAIL';
  const t = result.timing;
  console.log(`${mark} ${result.id.padEnd(26)} ${(t.wallMs / 1000).toFixed(1).padStart(5)}s p${t.promptN}/${t.cacheN}c g${t.genN} think${t.thinkN} ttfv${(t.ttfvMs / 1000).toFixed(1)}s${result.pass ? '' : `  ${result.detail}`}`);
  if (opts.verbose || !result.pass) console.log(`     -> ${result.output.replace(/\s+/g, ' ').slice(0, 220)}`);
}

async function runToolSuite(cases: ToolCase[]): Promise<SuiteResult> {
  const { SITE_TOOL_DECLARATIONS } = await import('@/lib/siteToolDeclarations');
  const { IDENTITY_BLOCK, SITE_TOOLS_BLOCK } = await import('@/lib/chatPromptBlocks');
  const { PROJECT_INDEX } = await import('@/lib/chatTools');
  const tools = SITE_TOOL_DECLARATIONS.filter(tool => !EXCLUDED_TOOLS.has(tool.name)).map(tool => ({ type: 'function', function: tool }));
  const system = [IDENTITY_BLOCK, SITE_TOOLS_BLOCK, `Projects (slug: what it is):\n${PROJECT_INDEX}`].join('\n\n');
  const maxTokens = 256 + thinkingHeadroom();
  await complete({ messages: [{ role: 'system', content: system }, { role: 'user', content: 'hi' }], tools, max_tokens: 1 });
  const results: CaseResult[] = [];
  for (const testCase of repeated(cases)) {
    const messages = [{ role: 'system', content: system }, ...withTurnContext(testCase.messages, stateBlock(testCase.state))];
    try {
      const { json, timing } = await complete({ messages, tools, tool_choice: 'auto', max_tokens: maxTokens });
      const message = json.choices?.[0]?.message;
      const calls = parseCalls(message);
      const failure = gradeTools(calls, testCase.expect);
      results.push({ id: testCase.id, category: testCase.category, pass: failure === null, detail: failure ?? '', output: `${describeCalls(calls)} | ${message?.content ?? ''}`, timing });
    } catch (error) {
      if (error instanceof ModelAccessError) throw error;
      results.push({ id: testCase.id, category: testCase.category, pass: false, detail: String(error), output: '', timing: NO_TIMING });
    }
    logCase(results.at(-1)!);
  }
  return summarize(results);
}

async function prepareChatCase(testCase: ChatCase, layout: ChatLayout) {
  const { REPLY_TOKEN_CAP, classifyReplyLength } = await import('@/lib/replyLength');
  const shaped = testCase.messages.flatMap(message => message.role === 'tool' ? [] : [{
    role: message.role, content: message.content,
    ...(message.role === 'assistant' && message.action ? { action: message.action } : {}),
  }]);
  const conversation = shaped.map(({ role, content }) => ({ role, content }));
  const latest = shaped.filter(message => message.role === 'user').at(-1)?.content ?? '';
  const length = classifyReplyLength(latest);
  const allFacts = opts.facts === 'all' && testCase.facts === undefined;
  const facts = testCase.facts ?? (allFacts ? allFactsText() : undefined);
  let system: string;
  let conditional = '';
  let messages: Msg[];
  let tools: unknown[] = [];
  if (layout === 'browser') {
    const { buildBrowserChatMessages } = await import('@/lib/browserChatPrompt');
    const browserFacts = facts === undefined ? factBundle().facts : [{ id: 'fixture', text: facts, tags: [], priority: 1, anchor: true }];
    const history = conversation.filter((message): message is { role: 'user' | 'assistant'; content: string } => message.role !== 'system');
    messages = buildBrowserChatMessages(browserFacts, history);
    system = messages[0].content;
  } else {
    const { buildDhruvSystemPromptParts, hasActionIntent } = await import('@/lib/chatContext.server');
    const { CHAT_TOOLS } = await import('@/lib/chatTools');
    const siteTools = layout === 'local' || hasActionIntent(latest);
    tools = siteTools ? CHAT_TOOLS : [];
    const parts = await buildDhruvSystemPromptParts(shaped, {
      factLimit: layout === 'local' ? 6 : 8,
      anchorsInStable: layout === 'local' && facts === undefined,
      siteTools,
      ...(facts === undefined ? {} : { factsOverride: allFacts ? '' : facts }),
    });
    system = allFacts ? `${parts.stable}\n\nRelevant facts:\n${facts}` : parts.stable;
    conditional = parts.conditional;
    messages = [{ role: 'system', content: system },
      ...(layout === 'cloud' && conditional ? [{ role: 'system' as const, content: conditional }] : []),
      ...(layout === 'local' && conditional ? withTurnContext(conversation, conditional) : conversation),
    ];
  }
  const input = { messages, ...(tools.length ? { tools, tool_choice: 'auto' } : {}) };
  return {
    body: { ...input, max_tokens: REPLY_TOKEN_CAP[length] + thinkingHeadroom() },
    length,
    prompt: {
      systemBytes: Buffer.byteLength(system), turnBytes: Buffer.byteLength(conditional),
      toolBytes: tools.length ? Buffer.byteLength(JSON.stringify(tools)) : 0,
      inputBytes: Buffer.byteLength(JSON.stringify(input)),
    },
  };
}

async function runChatSuite(cases: ChatCase[]): Promise<SuiteResult> {
  const results: CaseResult[] = [];
  let warmed = false;
  for (const testCase of repeated(cases)) {
    const prepared = await prepareChatCase(testCase, opts.layout as ChatLayout);
    if (!warmed) {
      await complete({ ...prepared.body, max_tokens: 1 });
      warmed = true;
    }
    try {
      const { json, timing } = await complete(prepared.body);
      const text: string = json.choices?.[0]?.message?.content ?? '';
      const calls = parseCalls(json.choices?.[0]?.message);
      const failure = gradeTools(calls, { none: true }) ?? gradeChat(text, testCase.check, MAX_WORDS[prepared.length]);
      results.push({ id: testCase.id, category: testCase.category, pass: failure === null, detail: failure ?? '', output: text, timing, calls, prompt: prepared.prompt });
    } catch (error) {
      if (error instanceof ModelAccessError) throw error;
      results.push({ id: testCase.id, category: testCase.category, pass: false, detail: String(error), output: '', timing: NO_TIMING, prompt: prepared.prompt });
    }
    logCase(results.at(-1)!);
  }
  return summarize(results);
}

async function runHarnessSuite(cases: HarnessCase[]): Promise<SuiteResult> {
  const tools = VOICE_LIVE_TOOL_DECLARATIONS.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
  const system = buildVoiceSystemInstruction(stateBlock(undefined));
  const results: CaseResult[] = [];
  let stateBytes = 0;
  let reads = 0;
  for (const testCase of repeated(cases)) {
    const messages: Msg[] = [{ role: 'system', content: system }, ...testCase.messages];
    const calls: ToolCall[] = [];
    const timing = { ...NO_TIMING };
    let text = '';
    let read = false;
    let failure: string | null = null;
    try {
      for (let turn = 0; turn < 4; turn += 1) {
        const completion = await complete({ messages, tools, tool_choice: 'auto', max_tokens: 256 + thinkingHeadroom() });
        for (const key of Object.keys(timing) as Array<keyof Timing>) timing[key] += completion.timing[key];
        const message = completion.json.choices?.[0]?.message;
        text = message?.content ?? '';
        const emitted = parseCalls(message);
        calls.push(...emitted);
        if (!emitted.length) break;
        messages.push({ role: 'assistant', content: text, tool_calls: emitted.map((call, index) => ({
          id: message?.tool_calls?.[index]?.id ?? `eval-${turn}-${index}`,
          type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) },
        })) });
        const hadReadResult = read;
        for (const [index, call] of emitted.entries()) {
          const parsed = parseSiteToolCall({ name: call.name, args: call.args });
          if (!parsed) throw new Error('Production validator rejected tool call');
          let response: Record<string, unknown> = { ok: true };
          if (parsed.name === 'get_recent_user_context') {
            read = true;
            reads += 1;
            const keys = { page: 'pageContext', preferences: 'preferences', interaction: 'interaction', media: 'media', chat: 'chat', history: 'recentActions' };
            const data = Object.fromEntries((parsed.args.include ?? ['page']).map(section => [keys[section], testCase.context?.[keys[section]] ?? null]));
            response = { ok: true, spokenText: '', data };
            stateBytes += Buffer.byteLength(JSON.stringify(response));
          } else if (testCase.context && !hadReadResult) {
            throw new Error('Acted before reading the requested live state');
          }
          messages.push({ role: 'tool', tool_call_id: message?.tool_calls?.[index]?.id ?? `eval-${turn}-${index}`, content: JSON.stringify(response) });
        }
        if (turn === 3) failure = 'exceeded 4 model turns';
      }
      failure ??= gradeTools(calls, testCase.expect);
      if (!failure && testCase.check) failure = gradeChat(text, testCase.check, 60);
    } catch (error) {
      if (error instanceof ModelAccessError) throw error;
      failure = String(error);
    }
    results.push({ id: testCase.id, category: testCase.category, pass: failure === null, detail: failure ?? '', output: `${describeCalls(calls)} | ${text}`, timing, calls, reply: text });
    logCase(results.at(-1)!);
  }
  console.log(`Harness state: ${reads} reads, ${stateBytes} response bytes (${reads ? Math.round(stateBytes / reads) : 0} average/read).`);
  return { ...summarize(results), context: { reads, responseBytes: stateBytes } };
}

function repeated<T>(cases: T[]): T[] {
  return Array.from({ length: Math.max(1, Number(opts.repeat)) }, () => cases).flat();
}

let cachedFacts: import('@/lib/factTypes').EmbeddingsBundle | undefined;

function factBundle(): import('@/lib/factTypes').EmbeddingsBundle {
  return cachedFacts ??= JSON.parse(readFileSync(path.resolve('lib/facts.embeddings.json'), 'utf8'));
}

function allFactsText(): string {
  return [...factBundle().facts]
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
    .map(fact => `- ${fact.text}`)
    .join('\n');
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function perf(result: BenchResult) {
  const timings = Object.values(result.suites).flatMap(suite => suite.cases.map(c => c.timing)).filter(t => t.wallMs > 0);
  const sum = (key: keyof Timing) => timings.reduce((total, t) => total + (t[key] ?? 0), 0);
  return {
    inputBytes: sum('requests') ? Math.round(sum('inputBytes') / sum('requests')) : 0,
    prefill: sum('promptMs') ? (sum('promptN') / sum('promptMs')) * 1000 : 0,
    decode: sum('genMs') ? (sum('genN') / sum('genMs')) * 1000 : 0,
    ttftP50: percentile(timings.map(t => t.promptMs), 0.5) / 1000,
    thinkP50: percentile(timings.map(t => t.thinkN ?? 0), 0.5),
    ttfvP50: percentile(timings.map(t => t.ttfvMs ?? t.promptMs), 0.5) / 1000,
    ttfvP90: percentile(timings.map(t => t.ttfvMs ?? t.promptMs), 0.9) / 1000,
    wallP50: percentile(timings.map(t => t.wallMs), 0.5) / 1000,
    wallP90: percentile(timings.map(t => t.wallMs), 0.9) / 1000,
    totalS: sum('wallMs') / 1000,
  };
}

function pct(suite: SuiteResult | undefined): string {
  return suite ? `${suite.pass}/${suite.total}` : '-';
}

// Chat replies are re-graded with the current checks so grader fixes apply to older result files.
async function compare(files: string[]): Promise<void> {
  const { classifyReplyLength } = await import('@/lib/replyLength');
  const results = files.map(file => JSON.parse(readFileSync(file, 'utf8')) as BenchResult);
  for (const r of results) {
    if (!r.suites.chat) continue;
    for (const c of r.suites.chat.cases) {
      const testCase = CHAT_CASES.find(candidate => candidate.id === c.id);
      const latest = testCase?.messages.at(-1);
      if (!testCase || !latest || !('content' in latest) || c.timing.wallMs === 0) continue;
      const failure = gradeTools(c.calls ?? [], { none: true }) ?? gradeChat(c.output, testCase.check, MAX_WORDS[classifyReplyLength(latest.content)]);
      c.pass = failure === null;
      c.detail = failure ?? '';
    }
    r.suites.chat = summarize(r.suites.chat.cases);
  }
  const categories = [...new Set(results.flatMap(r => Object.values(r.suites).flatMap(s => Object.keys(s.byCategory))))];
  const header = ['label', 'layout', 'tools', 'chat', 'harness', 'tool bytes', 'input bytes/call', 'chat input p50', 'state bytes/read', ...categories, 'prefill t/s', 'decode t/s', 'think p50', 'TTFT p50 s', 'TTFV p50 s', 'TTFV p90 s', 'wall p50 s'];
  console.log(`| ${header.join(' | ')} |\n|${header.map(() => '---').join('|')}|`);
  for (const r of results) {
    const p = perf(r);
    const cats = categories.map(cat => {
      const bucket = Object.values(r.suites).map(s => s.byCategory[cat]).find(Boolean);
      return bucket ? `${bucket.pass}/${bucket.total}` : '-';
    });
    const context = r.suites.harness?.context;
    const stateBytes = context?.reads ? Math.round(context.responseBytes / context.reads) : '-';
    const chatBytes = r.suites.chat?.cases.flatMap(test => test.prompt ? [test.prompt.inputBytes] : []) ?? [];
    console.log(`| ${[r.label, r.chatLayout ?? 'legacy', pct(r.suites.tools), pct(r.suites.chat), pct(r.suites.harness), r.harnessSize?.toolBytes ?? '-', p.inputBytes || '-', chatBytes.length ? percentile(chatBytes, 0.5) : '-', stateBytes, ...cats, p.prefill.toFixed(0), p.decode.toFixed(1), p.thinkP50, p.ttftP50.toFixed(2), p.ttfvP50.toFixed(2), p.ttfvP90.toFixed(2), p.wallP50.toFixed(2)].join(' | ')} |`);
  }
}

async function main(): Promise<void> {
  if (opts.compare) return compare(positionals);
  if (!['local', 'cloud', 'browser'].includes(opts.layout!)) throw new Error('--layout must be local, cloud, or browser');
  if (!Number.isInteger(Number(opts.repeat)) || Number(opts.repeat) < 1) throw new Error('--repeat must be a positive integer');
  const harnessSize = {
    tools: VOICE_LIVE_TOOL_DECLARATIONS.length,
    toolBytes: Buffer.byteLength(JSON.stringify(VOICE_LIVE_TOOL_DECLARATIONS)),
    systemBytes: Buffer.byteLength(buildVoiceSystemInstruction()),
  };
  console.log(`Harness size: ${JSON.stringify(harnessSize)}`);
  if (opts.measure) {
    for (const layout of ['local', 'cloud', 'browser'] as const) {
      const sizes: number[] = [];
      for (const testCase of CHAT_CASES) sizes.push((await prepareChatCase(testCase, layout)).prompt.inputBytes);
      console.log(`Chat input bytes: ${JSON.stringify({ layout, cases: sizes.length, p50: percentile(sizes, 0.5), p90: percentile(sizes, 0.9), max: Math.max(...sizes) })}`);
    }
    return;
  }
  if (!opts.label) throw new Error('--label is required');
  const filter = opts.filter ? new RegExp(opts.filter) : null;
  const pick = <T extends { id: string }>(cases: T[]) => {
    const selected = filter ? cases.filter(c => filter.test(c.id)) : cases;
    if (!selected.length) throw new Error('No cases matched --filter');
    return selected;
  };
  const props: { model_path?: string } = await fetch(opts.base.replace(/\/v1\/?$/, '') + '/props').then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  const result: BenchResult = { label: opts.label, base: opts.base, think: opts.think!, budget: BUDGET, facts: opts.facts!, sampling: sampling(), serverModel: props.model_path ?? '', finishedAt: '', suites: {}, harnessSize, chatLayout: opts.layout as ChatLayout };
  const suites = opts.suite!.split(',');
  if (suites.some(suite => !['tools', 'chat', 'harness'].includes(suite))) throw new Error('Unknown --suite');
  if (suites.includes('tools')) result.suites.tools = await runToolSuite(pick(TOOL_CASES));
  if (suites.includes('chat')) result.suites.chat = await runChatSuite(pick(CHAT_CASES));
  if (suites.includes('harness')) result.suites.harness = await runHarnessSuite(pick(HARNESS_CASES));
  result.finishedAt = new Date().toISOString();
  mkdirSync(opts.out!, { recursive: true });
  const file = path.join(opts.out!, `${opts.label}.json`);
  writeFileSync(file, JSON.stringify(result, null, 2));
  const p = perf(result);
  console.log(`\n${opts.label}: tools ${pct(result.suites.tools)}, chat ${pct(result.suites.chat)}, harness ${pct(result.suites.harness)}, prefill ${p.prefill.toFixed(0)} t/s, decode ${p.decode.toFixed(1)} t/s, think p50 ${p.thinkP50}, TTFV p50 ${p.ttfvP50.toFixed(2)}s p90 ${p.ttfvP90.toFixed(2)}s, wall p50 ${p.wallP50.toFixed(2)}s, total ${p.totalS.toFixed(0)}s -> ${file}`);
  if (Object.values(result.suites).some(suite => suite.pass < suite.total)) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
