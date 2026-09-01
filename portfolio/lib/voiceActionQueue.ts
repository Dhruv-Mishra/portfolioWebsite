import type { SiteActionHostId } from '@/lib/siteActionEvents';
import type { SiteToolArgsMap, SiteToolName } from '@/lib/siteTools';

export const END_VOICE_SESSION_SAFETY_MS = 8_000;

export type VoiceToolTiming = 'immediate' | 'deferred';

export interface VoiceToolPolicy {
  timing: VoiceToolTiming;
  hostId: SiteActionHostId | null;
}

const DEFERRED_VOICE_TOOLS = new Set<SiteToolName>([
  'navigate_to',
  'open_project',
  'open_link',
  'open_feedback',
  'open_command_palette',
  'open_shortcuts',
  'open_chat',
  'browse_history',
  'scroll_page',
  'end_voice_session',
]);

const DEPENDENT_HOST_BY_TOOL: Partial<Record<SiteToolName, SiteActionHostId>> = {
  control_project_video: 'project-video',
  send_chat_message: 'chat',
  run_terminal_command: 'terminal',
  submit_guestbook: 'guestbook',
  submit_feedback: 'feedback',
};

const FILL_FIELD_HOST_BY_ID: Partial<Record<SiteToolArgsMap['fill_field']['field'], SiteActionHostId>> = {
  'terminal-input': 'terminal',
  'chat-composer': 'chat',
  'guestbook-message': 'guestbook',
  'guestbook-name': 'guestbook',
  'feedback-message': 'feedback',
  'feedback-contact': 'feedback',
};

export function resolveVoiceToolPolicy(
  name: string,
  args?: { field?: string } | null,
): VoiceToolPolicy {
  const hostId = name === 'fill_field'
    ? FILL_FIELD_HOST_BY_ID[args?.field as SiteToolArgsMap['fill_field']['field']] ?? null
    : DEPENDENT_HOST_BY_TOOL[name as SiteToolName] ?? null;
  return {
    timing: DEFERRED_VOICE_TOOLS.has(name as SiteToolName) ? 'deferred' : 'immediate',
    hostId,
  };
}

export type VoiceQueuedCommit = () => void | Promise<void>;

export interface VoiceActionQueueOptions {
  canCommit: () => boolean;
  canHangup?: () => boolean;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

export interface VoiceQueueEnqueueOptions {
  ready?: () => boolean;
  readyTimeoutMs?: number;
}

export type VoiceQueueOutcome = 'completed' | 'cancelled' | 'timed-out';

interface QueueItem {
  run: VoiceQueuedCommit;
  hangup: boolean;
  ready?: () => boolean;
  readyTimeoutMs?: number;
  readyTimer: unknown | null;
  complete: (outcome: VoiceQueueOutcome) => void;
}

export interface VoiceActionQueue {
  enqueue(run: VoiceQueuedCommit, options?: VoiceQueueEnqueueOptions): Promise<VoiceQueueOutcome>;
  enqueueHangup(run: VoiceQueuedCommit, options?: { force?: boolean; timeoutMs?: number }): void;
  notifyReady(): void;
  reset(): void;
  size(): number;
  hasHangup(): boolean;
  isCommitting(): boolean;
}

export function createVoiceActionQueue(options: VoiceActionQueueOptions): VoiceActionQueue {
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel = options.cancel ?? ((handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  });

  const items: QueueItem[] = [];
  let committing = false;
  let hangupTimer: unknown = null;
  let generation = 0;

  function clearHangupTimer(): void {
    if (hangupTimer == null) return;
    cancel(hangupTimer);
    hangupTimer = null;
  }

  function reset(): void {
    generation += 1;
    for (const item of items) {
      if (item.readyTimer != null) cancel(item.readyTimer);
      item.complete('cancelled');
    }
    items.length = 0;
    committing = false;
    clearHangupTimer();
  }

  async function pump(): Promise<void> {
    if (committing) return;

    while (items.length > 0) {
      const next = items[0];
      const ready = next?.hangup
        ? (options.canHangup ?? options.canCommit)()
        : options.canCommit() && (next.ready?.() ?? true);
      if (!ready) {
        if (
          next
          && !next.hangup
          && next.ready
          && options.canCommit()
          && next.readyTimer == null
          && next.readyTimeoutMs != null
        ) {
          next.readyTimer = schedule(() => {
            const index = items.indexOf(next);
            if (index < 0) return;
            items.splice(index, 1);
            next.readyTimer = null;
            next.complete('timed-out');
            void pump();
          }, next.readyTimeoutMs);
        }
        return;
      }
      const item = items.shift();
      if (!item) return;
      if (item.readyTimer != null) cancel(item.readyTimer);
      if (item.hangup) clearHangupTimer();

      const token = generation;
      try {
        const result = item.run();
        if (result && typeof result.then === 'function') {
          committing = true;
          await result;
        }
      } finally {
        item.complete('completed');
        if (token === generation) committing = false;
      }
      if (token !== generation) return;
      if (!options.canCommit()) return;
    }
  }

  function enqueueHangup(
    run: VoiceQueuedCommit,
    hangupOptions: { force?: boolean; timeoutMs?: number } = {},
  ): void {
    const force = hangupOptions.force === true || items.some(item => item.hangup);
    if (force) {
      reset();
      void run();
      return;
    }

    items.push({ run, hangup: true, readyTimer: null, complete: () => {} });
    const timeoutMs = hangupOptions.timeoutMs ?? END_VOICE_SESSION_SAFETY_MS;
    hangupTimer = schedule(() => {
      hangupTimer = null;
      reset();
      void run();
    }, timeoutMs);
    void pump();
  }

  return {
    enqueue(run, enqueueOptions) {
      return new Promise<VoiceQueueOutcome>((resolve) => {
        items.push({
          run,
          hangup: false,
          ready: enqueueOptions?.ready,
          readyTimeoutMs: enqueueOptions?.readyTimeoutMs,
          readyTimer: null,
          complete: resolve,
        });
        void pump();
      });
    },
    enqueueHangup,
    notifyReady() {
      void pump();
    },
    reset,
    size: () => items.length,
    hasHangup: () => items.some(item => item.hangup),
    isCommitting: () => committing,
  };
}
