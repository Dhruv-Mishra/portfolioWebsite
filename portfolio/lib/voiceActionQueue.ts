export const IMMEDIATE_VOICE_TOOL_NAMES = [
  'lookup_site_facts',
  'set_theme',
  'set_preference',
  'fill_field',
  'submit_guestbook',
] as const;

export const DEFERRED_VOICE_TOOL_NAMES = [
  'navigate_to',
  'open_project',
  'open_link',
  'open_feedback',
  'open_command_palette',
  'end_voice_session',
] as const;

export const END_VOICE_SESSION_SAFETY_MS = 8_000;

export type ImmediateVoiceToolName = (typeof IMMEDIATE_VOICE_TOOL_NAMES)[number];
export type DeferredVoiceToolName = (typeof DEFERRED_VOICE_TOOL_NAMES)[number];

export function isDeferredVoiceTool(name: string): name is DeferredVoiceToolName {
  return (DEFERRED_VOICE_TOOL_NAMES as readonly string[]).includes(name);
}

export function isImmediateVoiceTool(name: string): name is ImmediateVoiceToolName {
  return (IMMEDIATE_VOICE_TOOL_NAMES as readonly string[]).includes(name);
}

export type VoiceQueuedCommit = () => void | Promise<void>;

export interface VoiceActionQueueOptions {
  canCommit: () => boolean;
  canHangup?: () => boolean;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

interface QueueItem {
  run: VoiceQueuedCommit;
  hangup: boolean;
}

export interface VoiceActionQueue {
  enqueue(run: VoiceQueuedCommit): void;
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
        : options.canCommit();
      if (!ready) return;
      const item = items.shift();
      if (!item) return;
      if (item.hangup) clearHangupTimer();

      const token = generation;
      committing = true;
      try {
        await item.run();
      } finally {
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

    items.push({ run, hangup: true });
    const timeoutMs = hangupOptions.timeoutMs ?? END_VOICE_SESSION_SAFETY_MS;
    hangupTimer = schedule(() => {
      hangupTimer = null;
      reset();
      void run();
    }, timeoutMs);
    void pump();
  }

  return {
    enqueue(run) {
      items.push({ run, hangup: false });
      void pump();
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
