export const IMMEDIATE_VOICE_TOOL_NAMES = [
  'lookup_site_facts',
  'get_current_page_context',
  'set_theme',
  'set_preference',
  'set_master_volume',
  'set_voice_output',
  'set_voice_backend',
  'set_motion_preference',
  'fill_field',
  'close_project',
] as const;

export const DEFERRED_VOICE_TOOL_NAMES = [
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
] as const;

export const DEPENDENT_VOICE_TOOL_NAMES = [
  'control_project_video',
  'send_chat_message',
  'run_terminal_command',
  'submit_guestbook',
  'submit_feedback',
] as const;

export const END_VOICE_SESSION_SAFETY_MS = 8_000;

export type ImmediateVoiceToolName = (typeof IMMEDIATE_VOICE_TOOL_NAMES)[number];
export type DeferredVoiceToolName = (typeof DEFERRED_VOICE_TOOL_NAMES)[number];
export type DependentVoiceToolName = (typeof DEPENDENT_VOICE_TOOL_NAMES)[number];

export function isDeferredVoiceTool(name: string): name is DeferredVoiceToolName {
  return (DEFERRED_VOICE_TOOL_NAMES as readonly string[]).includes(name);
}

export function isImmediateVoiceTool(name: string): name is ImmediateVoiceToolName {
  return (IMMEDIATE_VOICE_TOOL_NAMES as readonly string[]).includes(name);
}

export function isDependentVoiceTool(name: string): name is DependentVoiceToolName {
  return (DEPENDENT_VOICE_TOOL_NAMES as readonly string[]).includes(name);
}

export type VoiceDependentHostId = 'project-video' | 'chat' | 'terminal' | 'guestbook' | 'feedback';

export function dependentHostIdForTool(name: string): VoiceDependentHostId | null {
  if (name === 'control_project_video') return 'project-video';
  if (name === 'send_chat_message') return 'chat';
  if (name === 'run_terminal_command') return 'terminal';
  if (name === 'submit_guestbook') return 'guestbook';
  if (name === 'submit_feedback') return 'feedback';
  return null;
}

export function hostIdForVoiceTool(
  name: string,
  args?: { field?: string } | null,
): VoiceDependentHostId | null {
  const dependent = dependentHostIdForTool(name);
  if (dependent) return dependent;
  if (name === 'fill_field' && args?.field === 'terminal-input') return 'terminal';
  if (name === 'fill_field' && args?.field === 'chat-composer') return 'chat';
  if (name === 'fill_field' && (args?.field === 'guestbook-message' || args?.field === 'guestbook-name')) {
    return 'guestbook';
  }
  if (name === 'fill_field' && (args?.field === 'feedback-message' || args?.field === 'feedback-contact')) {
    return 'feedback';
  }
  return null;
}

export function openerHostIdForTool(
  name: string,
  args?: { path?: string } | null,
): VoiceDependentHostId | null {
  if (name === 'open_project') return 'project-video';
  if (name === 'open_chat') return 'chat';
  if (name === 'open_feedback') return 'feedback';
  if (name === 'navigate_to' && args?.path === '/') return 'terminal';
  if (name === 'navigate_to' && args?.path === '/guestbook') return 'guestbook';
  return null;
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
