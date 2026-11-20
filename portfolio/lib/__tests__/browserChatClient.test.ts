import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrowserChatWorkerRequest, BrowserChatWorkerResponse } from '@/lib/browserChatShared';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('browser chat worker dispatch', () => {
  it.each(['construction', 'postMessage'] as const)('rejects a synchronous %s failure and can retry cleanly', async failure => {
    let fail = true;
    const workers: WorkerMock[] = [];
    class WorkerMock {
      listeners = new Map<string, (event: { data?: BrowserChatWorkerResponse }) => void>();
      constructor() {
        if (fail && failure === 'construction') throw new Error('worker blocked');
        workers.push(this);
      }
      addEventListener(name: string, callback: (event: { data?: BrowserChatWorkerResponse }) => void) {
        this.listeners.set(name, callback);
      }
      postMessage(message: BrowserChatWorkerRequest) {
        if (fail) throw new Error('message blocked');
        queueMicrotask(() => this.listeners.get('message')?.({ data: { type: 'cleared', id: message.id } }));
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', WorkerMock);
    const { deleteBrowserChatModel } = await import('@/lib/browserChatClient');
    await expect(deleteBrowserChatModel()).rejects.toThrow(failure === 'construction' ? 'worker blocked' : 'message blocked');
    // A later worker error must not reject an orphaned request promise.
    workers[0]?.listeners.get('error')?.({});
    fail = false;
    await expect(deleteBrowserChatModel()).resolves.toBeUndefined();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
});
