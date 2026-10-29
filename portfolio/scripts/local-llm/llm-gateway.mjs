#!/usr/bin/env node
// Bounded admission gateway in front of one or more llama-server processes that share the same CPU.
// Requests are routed by their OpenAI `model` field, queued per model, and admitted through one shared
// CPU lane in round-robin order so a burst for one model cannot starve the other. Overload is shed with
// a fast 503 instead of letting requests pile up behind the slots.
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const env = (name, fallback) => process.env[name] ?? fallback;
const intEnv = (name, fallback) => {
  const value = Number.parseInt(env(name, ''), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const LISTEN_HOST = env('GATEWAY_HOST', '127.0.0.1');
const LISTEN_PORT = intEnv('GATEWAY_PORT', 8081);
// Shared CPU lane: total concurrent generations across every upstream.
const MAX_ACTIVE = intEnv('MAX_ACTIVE', 1);
// Waiting requests allowed per model.
const MAX_QUEUE = intEnv('MAX_QUEUE', 8);
const MAX_QUEUE_WAIT_MS = intEnv('MAX_QUEUE_WAIT_MS', 40_000);
const MAX_RUN_MS = intEnv('MAX_RUN_MS', 120_000);
const MAX_BODY_BYTES = intEnv('MAX_BODY_BYTES', 8 * 1024 * 1024);
const HEALTH_TIMEOUT_MS = intEnv('HEALTH_TIMEOUT_MS', 2_000);
const INITIAL_RUN_MS = intEnv('INITIAL_RUN_MS', 8_000);
const INITIAL_MEDIA_RUN_MS = intEnv('INITIAL_MEDIA_RUN_MS', INITIAL_RUN_MS * 2);
const API_KEY_FILE = env('API_KEY_FILE', '');
const MEDIA_PATTERN = /"(?:image_url|input_audio|video_url)"/;

// UPSTREAMS="text|http://127.0.0.1:8080|LFM3-1.7B,alias;omni|http://127.0.0.1:8082|LFM3-Omni-2B".
// The first upstream also receives requests whose model is missing or unknown.
function parseUpstreams() {
  const spec = env('UPSTREAMS', '').trim();
  const entries = spec
    ? spec.split(';').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
        const [name, url, models = ''] = entry.split('|').map((part) => part.trim());
        return { name, url, models: models.split(',').map((model) => model.trim()).filter(Boolean) };
      })
    : [{ name: 'default', url: env('UPSTREAM_URL', 'http://127.0.0.1:8080'), models: [] }];

  return entries.map(({ name, url, models }) => ({
    name,
    url: new URL(url),
    models: new Set(models.map((model) => model.toLowerCase())),
    agent: new http.Agent({ keepAlive: true, maxSockets: MAX_ACTIVE + 8 }),
    queue: [],
    // Exponential moving averages of slot hold time, split by whether the prompt carries media.
    avgRunMs: { text: INITIAL_RUN_MS, media: INITIAL_MEDIA_RUN_MS },
    stats: { admitted: 0, completed: 0, rejectedFull: 0, rejectedTimeout: 0, cancelledWhileQueued: 0, upstreamErrors: 0 },
  }));
}

const upstreams = parseUpstreams();
const defaultUpstream = upstreams[0];

// Read once at startup; restart the service after rotating the key.
const apiKeys = API_KEY_FILE
  ? readFileSync(API_KEY_FILE, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  : [];
const apiKeyDigests = apiKeys.map((key) => createHash('sha256').update(key).digest());

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer',
  'transfer-encoding', 'upgrade',
]);

const stats = { started: new Date().toISOString(), unauthorized: 0, tooLarge: 0 };
const running = new Set();
let draining = false;
let nextUpstreamIndex = 0;

const sum = (values) => values.reduce((total, value) => total + value, 0);
const totalWaiting = () => sum(upstreams.map((upstream) => upstream.queue.length));
const totalStat = (key) => sum(upstreams.map((upstream) => upstream.stats[key]));
const expectedRunMs = (job) => job.upstream.avgRunMs[job.kind];

function isAuthorized(header) {
  if (apiKeyDigests.length === 0) return true;
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  if (!match) return false;
  const digest = createHash('sha256').update(match[1].trim()).digest();
  return apiKeyDigests.some((known) => timingSafeEqual(known, digest));
}

function sendJson(res, status, body, headers = {}) {
  if (res.headersSent || res.destroyed) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function sendError(res, status, code, message, headers) {
  const type = code === 'unauthorized' ? 'authentication_error' : code === 'body_too_large' ? 'invalid_request_error' : 'server_busy';
  sendJson(res, status, { error: { message, type, code } }, headers);
}

// Expected time until a new job appended to `target` reaches the CPU lane, given round-robin order:
// before it runs, its own queue drains `ahead` jobs and every other queue drains at most `ahead + 1`.
function estimatedWaitMs(target) {
  const now = Date.now();
  if (running.size < MAX_ACTIVE && totalWaiting() === 0) return 0;
  const ahead = target.queue.length;
  let work = sum([...running].map((job) => Math.max(expectedRunMs(job) * 0.1, expectedRunMs(job) - (now - job.startedAt))));
  for (const upstream of upstreams) {
    const count = upstream === target ? ahead : Math.min(upstream.queue.length, ahead + 1);
    work += sum(upstream.queue.slice(0, count).map(expectedRunMs));
  }
  return work / MAX_ACTIVE;
}

function retryAfterSeconds(target) {
  return String(Math.max(1, Math.min(60, Math.ceil(estimatedWaitMs(target) / 1000))));
}

function queueHeaders(extra = {}) {
  return { 'X-Queue-Active': String(running.size), 'X-Queue-Waiting': String(totalWaiting()), ...extra };
}

function isQueuedRoute(req) {
  return req.method === 'POST' && !/\/(tokenize|detokenize|apply-template)$/.test(req.url ?? '');
}

function upstreamHeaders(req, upstream, body) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(name) && name !== 'host' && name !== 'content-length') headers[name] = value;
  }
  headers.host = upstream.url.host;
  if (body) headers['content-length'] = String(body.length);
  else if (req.headers['content-length']) headers['content-length'] = req.headers['content-length'];
  return headers;
}

// Proxies one request. Queued jobs pass a buffered body; pass-through routes stream the request body.
function forward(req, res, upstream, { body, onDone, extraHeaders = {} } = {}) {
  let runTimer;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(runTimer);
    onDone?.();
  };

  const upstreamReq = http.request({
    protocol: upstream.url.protocol,
    hostname: upstream.url.hostname,
    port: upstream.url.port,
    method: req.method,
    path: req.url,
    headers: upstreamHeaders(req, upstream, body),
    agent: upstream.agent,
  }, (upstreamRes) => {
    const responseHeaders = {};
    for (const [name, value] of Object.entries(upstreamRes.headers)) {
      if (!HOP_BY_HOP.has(name) && value !== undefined) responseHeaders[name] = value;
    }
    res.writeHead(upstreamRes.statusCode ?? 502, { ...responseHeaders, ...queueHeaders(extraHeaders) });
    upstreamRes.pipe(res);
    upstreamRes.on('end', finish);
    upstreamRes.on('error', () => { res.destroy(); finish(); });
  });

  if (onDone) runTimer = setTimeout(() => upstreamReq.destroy(new Error('run timeout')), MAX_RUN_MS);

  upstreamReq.on('error', () => {
    upstream.stats.upstreamErrors += 1;
    if (!res.headersSent) sendError(res, 502, 'upstream_unavailable', 'The model server is unavailable.');
    else res.destroy();
    finish();
  });
  // Closing the upstream socket makes llama-server cancel the task and free the slot.
  res.on('close', () => {
    if (!res.writableFinished) upstreamReq.destroy();
    finish();
  });
  if (body) upstreamReq.end(body);
  else req.pipe(upstreamReq);
}

function takeNextJob() {
  for (let offset = 0; offset < upstreams.length; offset += 1) {
    const index = (nextUpstreamIndex + offset) % upstreams.length;
    const job = upstreams[index].queue.shift();
    if (job) {
      nextUpstreamIndex = (index + 1) % upstreams.length;
      return job;
    }
  }
  return undefined;
}

function dispatch() {
  while (running.size < MAX_ACTIVE) {
    const job = takeNextJob();
    if (!job) return;
    clearTimeout(job.waitTimer);
    if (job.res.destroyed) continue;
    const { upstream } = job;
    job.startedAt = Date.now();
    running.add(job);
    upstream.stats.admitted += 1;
    forward(job.req, job.res, upstream, {
      body: job.body,
      extraHeaders: { 'X-Queue-Wait-Ms': String(job.startedAt - job.enqueuedAt), 'X-Upstream': upstream.name },
      onDone: () => {
        running.delete(job);
        upstream.stats.completed += 1;
        upstream.avgRunMs[job.kind] = upstream.avgRunMs[job.kind] * 0.8 + (Date.now() - job.startedAt) * 0.2;
        dispatch();
      },
    });
  }
}

function selectUpstream(body) {
  let model;
  try {
    model = JSON.parse(body.toString('utf8'))?.model;
  } catch {
    // Unparseable bodies go to the default upstream, which returns the proper error.
  }
  if (typeof model !== 'string') return defaultUpstream;
  const key = model.trim().toLowerCase();
  return upstreams.find((upstream) => upstream.models.has(key)) ?? defaultUpstream;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.removeAllListeners('data');
        req.resume();
        reject(new Error('body_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
    req.on('close', () => reject(new Error('closed')));
  });
}

async function enqueue(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    if (error instanceof Error && error.message === 'body_too_large') {
      stats.tooLarge += 1;
      sendError(res, 413, 'body_too_large', 'The request body is too large.');
    }
    return;
  }
  if (res.destroyed || draining) {
    if (draining) sendError(res, 503, 'restarting', 'The model server is restarting.', { 'Retry-After': '5' });
    return;
  }

  const upstream = selectUpstream(body);
  // Fail fast when the caller would almost certainly time out in the queue anyway.
  if (upstream.queue.length >= MAX_QUEUE || estimatedWaitMs(upstream) > MAX_QUEUE_WAIT_MS) {
    upstream.stats.rejectedFull += 1;
    sendError(res, 503, 'queue_full', 'The local model is busy. Try again shortly.', queueHeaders({ 'Retry-After': retryAfterSeconds(upstream) }));
    return;
  }

  const job = {
    req,
    res,
    body,
    upstream,
    kind: MEDIA_PATTERN.test(body.toString('latin1')) ? 'media' : 'text',
    enqueuedAt: Date.now(),
    startedAt: 0,
    waitTimer: undefined,
  };
  job.waitTimer = setTimeout(() => {
    const index = upstream.queue.indexOf(job);
    if (index === -1) return;
    upstream.queue.splice(index, 1);
    upstream.stats.rejectedTimeout += 1;
    sendError(res, 503, 'queue_timeout', 'The local model is busy. Try again shortly.', queueHeaders({ 'Retry-After': retryAfterSeconds(upstream) }));
  }, MAX_QUEUE_WAIT_MS);
  res.on('close', () => {
    const index = upstream.queue.indexOf(job);
    if (index === -1) return;
    upstream.queue.splice(index, 1);
    clearTimeout(job.waitTimer);
    upstream.stats.cancelledWhileQueued += 1;
  });
  upstream.queue.push(job);
  dispatch();
}

async function fetchUpstreamJson(upstream, path, headers = {}) {
  try {
    const response = await fetch(new URL(path, upstream.url), { headers, signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  } catch {
    return { status: 503, body: { status: 'unavailable' } };
  }
}

async function handleHealth(res) {
  const results = await Promise.all(upstreams.map((upstream) => fetchUpstreamJson(upstream, '/health')));
  const upstreamStatus = Object.fromEntries(upstreams.map((upstream, index) => [
    upstream.name,
    results[index].status === 200 ? 'ok' : (results[index].body.status ?? 'unavailable'),
  ]));
  const ok = !draining && results.some((result) => result.status === 200);
  sendJson(res, ok ? 200 : 503, {
    status: ok ? 'ok' : (draining ? 'restarting' : 'unavailable'),
    upstreams: upstreamStatus,
    queue: { active: running.size, waiting: totalWaiting(), maxActive: MAX_ACTIVE, maxQueue: MAX_QUEUE },
  });
}

// Lists models from every upstream that currently answers, in upstream order.
async function handleModels(req, res) {
  if (!isAuthorized(req.headers.authorization)) {
    stats.unauthorized += 1;
    sendError(res, 401, 'unauthorized', 'Invalid API key.');
    return;
  }
  const headers = req.headers.authorization ? { Authorization: req.headers.authorization } : {};
  const results = await Promise.all(upstreams.map((upstream) => fetchUpstreamJson(upstream, '/v1/models', headers)));
  const data = results.flatMap((result) => (result.status === 200 && Array.isArray(result.body.data) ? result.body.data : []));
  sendJson(res, 200, { object: 'list', data });
}

function gatewayStats() {
  return {
    ...stats,
    admitted: totalStat('admitted'),
    completed: totalStat('completed'),
    rejectedFull: totalStat('rejectedFull'),
    rejectedTimeout: totalStat('rejectedTimeout'),
    cancelledWhileQueued: totalStat('cancelledWhileQueued'),
    upstreamErrors: totalStat('upstreamErrors'),
    active: running.size,
    waiting: totalWaiting(),
    maxActive: MAX_ACTIVE,
    maxQueue: MAX_QUEUE,
    upstreams: upstreams.map((upstream) => ({
      name: upstream.name,
      waiting: upstream.queue.length,
      avgRunMs: { text: Math.round(upstream.avgRunMs.text), media: Math.round(upstream.avgRunMs.media) },
      ...upstream.stats,
    })),
  };
}

const server = http.createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];

  if (req.method === 'GET' && path === '/health') {
    void handleHealth(res);
    return;
  }
  if (req.method === 'GET' && path === '/gateway/stats') {
    sendJson(res, 200, gatewayStats());
    return;
  }
  if (draining) {
    sendError(res, 503, 'restarting', 'The model server is restarting.', { 'Retry-After': '5' });
    return;
  }
  if (req.method === 'GET' && (path === '/v1/models' || path === '/models')) {
    void handleModels(req, res);
    return;
  }
  if (isQueuedRoute(req)) {
    if (!isAuthorized(req.headers.authorization)) {
      stats.unauthorized += 1;
      req.resume();
      sendError(res, 401, 'unauthorized', 'Invalid API key.');
      return;
    }
    void enqueue(req, res);
    return;
  }
  forward(req, res, defaultUpstream);
});

server.requestTimeout = 0;
server.headersTimeout = 30_000;
server.keepAliveTimeout = 65_000;
server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  const routes = upstreams.map((upstream) => `${upstream.name}=${upstream.url.origin}`).join(', ');
  console.log(`llm-gateway listening on ${LISTEN_HOST}:${LISTEN_PORT} -> ${routes} (active ${MAX_ACTIVE}, queue ${MAX_QUEUE}/model, wait ${MAX_QUEUE_WAIT_MS} ms)`);
});

function shutdown() {
  if (draining) return;
  draining = true;
  for (const upstream of upstreams) {
    for (const job of upstream.queue.splice(0)) {
      clearTimeout(job.waitTimer);
      sendError(job.res, 503, 'restarting', 'The model server is restarting.', { 'Retry-After': '5' });
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 30_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
