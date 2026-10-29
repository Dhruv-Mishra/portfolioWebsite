import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const GATEWAY = path.resolve(__dirname, '../../scripts/local-llm/llm-gateway.mjs');
const API_KEY = 'test-key';

let upstream: http.Server;
let upstreamPort: number;
let keyFile: string;
let gatewayUrl: string;
let upstreamActive = 0;
let upstreamMaxActive = 0;
const releases: Array<() => void> = [];
const gateways: ChildProcess[] = [];

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = http.createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

function chat(headers: Record<string, string> = { Authorization: `Bearer ${API_KEY}` }, url = gatewayUrl) {
  return fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
  });
}

async function waitFor(check: () => boolean, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function startGateway(env: Record<string, string>): Promise<string> {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  gateways.push(spawn(process.execPath, [GATEWAY], {
    env: {
      ...process.env,
      GATEWAY_PORT: String(port),
      UPSTREAM_URL: `http://127.0.0.1:${upstreamPort}`,
      MAX_ACTIVE: '1',
      MAX_QUEUE: '1',
      MAX_QUEUE_WAIT_MS: '400',
      API_KEY_FILE: keyFile,
      ...env,
    },
    stdio: 'ignore',
  }));
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const ready = await fetch(`${url}/health`).then((response) => response.ok, () => false);
    if (ready) return url;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('gateway did not start');
}

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ok"}');
      return;
    }
    upstreamActive += 1;
    upstreamMaxActive = Math.max(upstreamMaxActive, upstreamActive);
    req.resume();
    const release = () => {
      upstreamActive -= 1;
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"choices":[{"message":{"content":"ok"}}]}');
    };
    releases.push(release);
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  upstreamPort = (upstream.address() as AddressInfo).port;

  const keyDir = mkdtempSync(path.join(tmpdir(), 'llm-gateway-'));
  keyFile = path.join(keyDir, 'api-key');
  writeFileSync(keyFile, `${API_KEY}\n`);
  gatewayUrl = await startGateway({ INITIAL_RUN_MS: '50' });
});

afterAll(async () => {
  for (const gateway of gateways) gateway.kill('SIGTERM');
  while (releases.length > 0) releases.shift()?.();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

describe('llm gateway', () => {
  it('sheds immediately when the estimated wait already exceeds the wait budget', async () => {
    const slowUrl = await startGateway({ INITIAL_RUN_MS: '10000', MAX_QUEUE: '4' });
    const first = chat(undefined, slowUrl);
    await waitFor(() => upstreamActive === 1);

    const startedAt = Date.now();
    const shed = await chat(undefined, slowUrl);
    expect(shed.status).toBe(503);
    expect(Date.now() - startedAt).toBeLessThan(300);
    await expect(shed.json()).resolves.toMatchObject({ error: { code: 'queue_full' } });

    releases.shift()?.();
    expect((await first).status).toBe(200);
    upstreamMaxActive = 0;
  });

  it('reports queue state on the unauthenticated health route', async () => {
    const response = await fetch(`${gatewayUrl}/health`);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      queue: { active: 0, waiting: 0, maxActive: 1, maxQueue: 1 },
    });
  });

  it('rejects a bad key before it can occupy the queue', async () => {
    const response = await chat({ Authorization: 'Bearer wrong' });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'unauthorized' } });
    expect(upstreamActive).toBe(0);
  });

  it('serializes work, sheds overflow with 503, and times out stale waiters', async () => {
    const first = chat();
    await waitFor(() => upstreamActive === 1);
    const second = chat();
    await waitFor(() => releases.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const overflow = await chat();
    expect(overflow.status).toBe(503);
    expect(overflow.headers.get('retry-after')).toMatch(/^\d+$/);
    await expect(overflow.json()).resolves.toMatchObject({ error: { code: 'queue_full' } });

    const timedOut = await second;
    expect(timedOut.status).toBe(503);
    await expect(timedOut.json()).resolves.toMatchObject({ error: { code: 'queue_timeout' } });

    releases.shift()?.();
    const done = await first;
    expect(done.status).toBe(200);
    expect(done.headers.get('x-queue-wait-ms')).toMatch(/^\d+$/);
    expect(upstreamMaxActive).toBe(1);
  });

  it('dispatches the next waiter once a slot frees up', async () => {
    const first = chat();
    await waitFor(() => upstreamActive === 1);
    const second = chat();
    await new Promise((resolve) => setTimeout(resolve, 50));
    releases.shift()?.();
    await waitFor(() => releases.length === 1);
    releases.shift()?.();

    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    expect(upstreamMaxActive).toBe(1);
  });

  it('drops a queued request when its client disconnects', async () => {
    const first = chat();
    await waitFor(() => upstreamActive === 1);
    const controller = new AbortController();
    const queued = fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: '{}',
      signal: controller.signal,
    }).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 50));
    controller.abort();
    await queued;
    await new Promise((resolve) => setTimeout(resolve, 50));

    const stats = await fetch(`${gatewayUrl}/gateway/stats`).then((response) => response.json());
    expect(stats).toMatchObject({ waiting: 0, cancelledWhileQueued: 1 });
    releases.shift()?.();
    expect((await first).status).toBe(200);
    expect(releases).toHaveLength(0);
  });
});

describe('llm gateway with two models on one CPU lane', () => {
  interface FakeUpstream {
    server: http.Server;
    port: number;
    started: string[];
    pending: Array<() => void>;
  }

  const order: string[] = [];
  let running = 0;
  let maxRunning = 0;
  let text: FakeUpstream;
  let omni: FakeUpstream;
  let url: string;

  async function startUpstream(name: string, modelId: string): Promise<FakeUpstream> {
    const upstreamState: FakeUpstream = { server: http.createServer(), port: 0, started: [], pending: [] };
    upstreamState.server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ok"}');
        return;
      }
      if (req.method === 'GET' && req.url === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ object: 'list', data: [{ id: modelId }] }));
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const label = `${name}:${(JSON.parse(body) as { tag: string }).tag}`;
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        order.push(label);
        upstreamState.started.push(label);
        upstreamState.pending.push(() => {
          running -= 1;
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ upstream: name }));
        });
      });
    });
    await new Promise<void>((resolve) => upstreamState.server.listen(0, '127.0.0.1', resolve));
    upstreamState.port = (upstreamState.server.address() as AddressInfo).port;
    return upstreamState;
  }

  function send(model: string | undefined, tag: string, extra: Record<string, unknown> = {}) {
    return fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ model, tag, messages: [{ role: 'user', content: 'hi' }], ...extra }),
    });
  }

  function releaseNext() {
    const release = text.pending.shift() ?? omni.pending.shift();
    release?.();
  }

  beforeAll(async () => {
    text = await startUpstream('text', 'LFM3-1.7B');
    omni = await startUpstream('omni', 'LFM3-Omni-2B');
    url = await startGateway({
      UPSTREAMS: `text|http://127.0.0.1:${text.port}|LFM3-1.7B,legacy-alias;omni|http://127.0.0.1:${omni.port}|LFM3-Omni-2B`,
      MAX_QUEUE: '4',
      MAX_QUEUE_WAIT_MS: '5000',
      INITIAL_RUN_MS: '50',
    });
  });

  afterAll(async () => {
    for (const upstreamState of [text, omni]) {
      while (upstreamState.pending.length > 0) upstreamState.pending.shift()?.();
      await new Promise<void>((resolve) => upstreamState.server.close(() => resolve()));
    }
  });

  it('routes by model id and sends unknown models to the first upstream', async () => {
    const requests = [send('LFM3-Omni-2B', 'a'), send('legacy-alias', 'b'), send(undefined, 'c')];
    for (let index = 0; index < requests.length; index += 1) {
      await waitFor(() => text.pending.length + omni.pending.length === 1);
      releaseNext();
    }
    const bodies = await Promise.all(requests.map(async (request) => (await request).json()));

    expect(bodies.map((body) => body.upstream).sort()).toEqual(['omni', 'text', 'text']);
    expect(maxRunning).toBe(1);
  });

  it('shares one CPU lane and alternates between model queues', async () => {
    order.length = 0;
    const first = send('LFM3-1.7B', 't1');
    await waitFor(() => running === 1);
    const queued: Array<Promise<Response>> = [];
    for (const [model, tag, extra] of [['LFM3-1.7B', 't2', {}], ['LFM3-1.7B', 't3', {}], ['LFM3-Omni-2B', 'o1', { image_url: 'x' }]] as const) {
      queued.push(send(model, tag, extra));
      const expectedWaiting = queued.length;
      const deadline = Date.now() + 3_000;
      while ((await fetch(`${url}/gateway/stats`).then((response) => response.json())).waiting !== expectedWaiting) {
        if (Date.now() > deadline) throw new Error('request was not queued');
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    releaseNext();
    for (let index = 0; index < queued.length; index += 1) {
      await waitFor(() => running === 1);
      releaseNext();
    }
    await Promise.all([first, ...queued]);

    expect(order).toEqual(['text:t1', 'omni:o1', 'text:t2', 'text:t3']);
    expect(maxRunning).toBe(1);
  });

  it('lists models from every reachable upstream', async () => {
    const response = await fetch(`${url}/v1/models`, { headers: { Authorization: `Bearer ${API_KEY}` } });
    await expect(response.json()).resolves.toEqual({ object: 'list', data: [{ id: 'LFM3-1.7B' }, { id: 'LFM3-Omni-2B' }] });
    expect((await fetch(`${url}/v1/models`)).status).toBe(401);
  });

  it('reports per-upstream health', async () => {
    await expect(fetch(`${url}/health`).then((response) => response.json())).resolves.toMatchObject({
      status: 'ok',
      upstreams: { text: 'ok', omni: 'ok' },
    });
  });
});
