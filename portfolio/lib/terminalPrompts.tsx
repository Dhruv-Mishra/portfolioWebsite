"use client";

/**
 * Terminal inline-prompt registry.
 *
 * When a terminal command needs to ask the user for more input (e.g. a
 * password entry for `sudo cat adminTerminal.txt`, or the two-step
 * username/password for `sudo admin`), it pushes a prompt descriptor
 * onto this module-level queue. The Terminal component subscribes to the
 * queue and, while a prompt is active:
 *   - shows the prompt's label in place of the normal ➜ ~ bash chrome
 *   - masks characters with `*` if the prompt requested it
 *   - on Enter, calls the prompt's `onSubmit` with the raw (unmasked)
 *     text, which decides:
 *       * `"consume"` — close this prompt and move on
 *       * `"push"`    — keep the chain going with a new prompt
 *       * `"cancel"`  — abort and return to the regular terminal
 *
 * Why a module-level queue?
 *   Terminal commands return plain data structures — they don't own a
 *   React handle to the Terminal component. The queue is the bridge:
 *   commands push prompts synchronously, the Terminal reads them via
 *   a `useSyncExternalStore` subscription.
 */

import type React from 'react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

/**
 * Return value from a prompt's `onSubmit`. Determines what the Terminal
 * does next after rendering the user's submission.
 */
export type PromptSubmitAction =
  | {
      /** Close the current prompt, render these output lines, go back to normal terminal. */
      kind: 'consume';
      /** Optional echo of what the user typed (displayed as the "command"). */
      echo?: string;
      /** React node to append to the terminal output. */
      output?: React.ReactNode;
      /** Optional side effect. */
      action?: () => void;
    }
  | {
      /** Replace the current prompt with a new one. Used for username → password chains. */
      kind: 'push';
      prompt: TerminalPrompt;
      echo?: string;
      output?: React.ReactNode;
    }
  | {
      /** Abort — close the prompt and render a cancel message. */
      kind: 'cancel';
      echo?: string;
      output?: React.ReactNode;
    };

/**
 * Descriptor for an inline prompt.
 *
 * The Terminal component renders `label` in lieu of the bash prompt and
 * routes the next Enter's input into `onSubmit`.
 */
export interface TerminalPrompt {
  /** Internal identifier — used for analytics + debug. */
  id: string;
  /** Rendered on the left of the input. e.g. "Enter password:" */
  label: React.ReactNode;
  /** When true, replace each character with `*` in the rendered input. */
  masked?: boolean;
  /** Called with the user's raw input text when they press Enter. */
  onSubmit: (value: string, ctx: TerminalPromptContext) => PromptSubmitAction | Promise<PromptSubmitAction>;
  /** Called if the user types ESC or blank input (optional). */
  onCancel?: () => PromptSubmitAction | null;
}

export interface TerminalPromptContext {
  router: AppRouterInstance | null;
}

type Listener = () => void;

let activePrompt: TerminalPrompt | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

export function getActivePrompt(): TerminalPrompt | null {
  return activePrompt;
}

export function subscribeToPrompts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Imperatively install a prompt. Overwrites any currently active prompt. */
export function setActivePrompt(prompt: TerminalPrompt | null): void {
  activePrompt = prompt;
  emit();
}
