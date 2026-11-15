"use client";

import React, { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { useTerminal } from "@/context/TerminalContext";
import { useAppHaptics } from "@/lib/haptics";
import { soundManager } from "@/lib/soundManager";
import { unlockSticker } from "@/hooks/useStickers";
import { appendUserAction, isPublicTerminalCommand } from "@/lib/userActionJournal";
import { useRouter } from "next/navigation";
import { HEADER_NOISE_SVG } from "@/lib/assets";
import {
    TERMINAL_COLORS,
    SKETCH_RADIUS,
    LAYOUT_TOKENS,
} from "@/lib/designTokens";
import {
    TERMINAL_COMMAND_NAME_SET,
    completeTerminalCommandInput,
    type TerminalCommandCompletionSession,
} from "@/lib/terminalCommandNames";
import type { CommandHandler } from "@/lib/terminalCommands";
import {
    getActivePrompt,
    subscribeToPrompts,
    setActivePrompt,
    type PromptSubmitAction,
} from "@/lib/terminalPrompts";
import {
    RUN_TERMINAL_COMMAND_EVENT,
    attachSiteActionResult,
    registerSiteActionHost,
    type RunTerminalCommandEventDetail,
} from "@/lib/siteActionEvents";
import { resolveVoiceSafeTerminalCommand } from "@/lib/siteTools";
import { WindowControls } from "./DoodleIcons";
import PillScrollbar from "@/components/PillScrollbar";
import TerminalPrompt from "@/components/TerminalPrompt";
import { useTerminalPlaceholder } from "@/hooks/useTerminalPlaceholder";

// Hoisted style objects to avoid re-creating on every render
const shadowStyle = { borderRadius: SKETCH_RADIUS.terminal } as const;
const containerStyle = {
    borderRadius: SKETCH_RADIUS.terminal,
    boxShadow: 'var(--c-terminal-shadow)',
    backgroundColor: TERMINAL_COLORS.bg,
} as const;
const headerStyle = { backgroundColor: TERMINAL_COLORS.headerBg } as const;
const noiseStyle = { backgroundImage: HEADER_NOISE_SVG } as const;
const isDesktopViewport = () => window.innerWidth >= LAYOUT_TOKENS.mobileBreakpoint;
type CommandRegistry = Record<string, CommandHandler>;

// Memoised output area — only re-renders when outputLines changes, not on every keystroke
interface TerminalOutputProps {
    outputLines: { id: number; command: string; output: React.ReactNode; hideCommandHeader?: boolean }[];
}

const TerminalOutput = React.memo(function TerminalOutput({ outputLines }: TerminalOutputProps) {
    return (
        <>
            {outputLines.map((item) => {
                // When `hideCommandHeader` is set (sensitive inline-prompt
                // submissions: decrypt password, admin username/password),
                // the `guest@dhruv:~$ <echo>` header line is suppressed entirely so the
                // transcript never shows the submitted value — bullets or
                // otherwise. We still render the `output` block (e.g. the
                // decrypt bar or auth failure note), but drop the left
                // border + indent so the result flows directly after the
                // preceding command without a visual "reply" gutter for a
                // non-existent header.
                if (item.hideCommandHeader) {
                    if (!item.output) return null;
                    return (
                        <div key={item.id} className="mb-4">
                            <div className={`${TERMINAL_COLORS.output} tracking-wide leading-relaxed`}>
                                {item.output}
                            </div>
                        </div>
                    );
                }
                return (
                    <div key={item.id} className="mb-4">
                        <div className="flex gap-x-[1ch] opacity-90">
                            <TerminalPrompt />
                            <span className={`min-w-0 break-all ${TERMINAL_COLORS.command}`}>{item.command}</span>
                        </div>
                        {item.output && (
                            <div className={`ml-7 mt-2 ${TERMINAL_COLORS.output} tracking-wide leading-relaxed border-l-2 ${TERMINAL_COLORS.border} pl-3`}>
                                {item.output}
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
});

const getServerPromptSnapshot = () => null;

export default function Terminal() {
    const { outputLines, commandHistory, addCommand, addToHistory, clearOutput } = useTerminal();
    const { clear: clearHaptic, error: errorHaptic, submit, warning } = useAppHaptics();
    const router = useRouter(); // Correctly using hook inside component

    const [input, setInput] = useState("");
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [isInputFocused, setIsInputFocused] = useState(false);

    // Inline prompt subscription. When non-null, the next Enter-press is
    // routed to the prompt's `onSubmit` instead of the command registry.
    const activePrompt = useSyncExternalStore(subscribeToPrompts, getActivePrompt, getServerPromptSnapshot);

    const inputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const commandRegistryRef = useRef<CommandRegistry | null>(null);
    const completionSessionRef = useRef<TerminalCommandCompletionSession | null>(null);

    const getCommandRegistry = React.useCallback(async (): Promise<CommandRegistry> => {
        if (!commandRegistryRef.current) {
            const { createCommandRegistry } = await import("@/lib/terminalCommands");
            commandRegistryRef.current = createCommandRegistry(router);
        }
        return commandRegistryRef.current;
    }, [router]);

    useEffect(() => {
        commandRegistryRef.current = null;
    }, [router]);

    // When a prompt activates, auto-focus the input and clear any leftover text
    // so the user can start typing the password / username immediately.
    useEffect(() => {
        if (!activePrompt) return;
        completionSessionRef.current = null;
        const clearInputTimer = window.setTimeout(() => setInput(""), 0);
        // Desktop: focus immediately. Mobile: don't pop the keyboard
        // unsolicited — the user already tapped to trigger the prompt
        // chain, so focus is usually preserved anyway.
        let focusTimer: number | undefined;
        if (isDesktopViewport()) {
            focusTimer = window.setTimeout(() => inputRef.current?.focus(), 30);
        }

        return () => {
            window.clearTimeout(clearInputTimer);
            if (focusTimer !== undefined) window.clearTimeout(focusTimer);
        };
    }, [activePrompt]);

    // Typewritten placeholder — cycles command hints while the input is empty.
    // Stops automatically the moment the user types anything (overlay unmounts).
    // Also disabled while a prompt (password/username) is active so the
    // placeholder doesn't distract from the request being made.
    const isPlaceholderActive = !input && !isInputFocused && activePrompt === null;
    const placeholderRef = useTerminalPlaceholder(isPlaceholderActive);

    const warmCommandRegistry = React.useCallback(() => {
        void getCommandRegistry().catch(() => {});
    }, [getCommandRegistry]);

    const updateInput = React.useCallback((next: string) => {
        completionSessionRef.current = null;
        setInput(next);
    }, []);

    // Keep the newest output in view by scrolling the terminal body only; scrollIntoView would also move the page.
    useEffect(() => {
        const body = scrollRef.current;
        body?.scrollTo({ top: body.scrollHeight, behavior: "smooth" });
    }, [outputLines]);

    const applyPromptAction = React.useCallback((action: PromptSubmitAction, rawText: string) => {
        const echo = action.echo ?? rawText;
        const output = action.output ?? null;
        // Inline-prompt submissions must NEVER appear in the command-history
        // ring (↑/↓ arrows). That would leak passwords/usernames and surface
        // bare echoes like "•••••" at the main `guest@dhruv:~$` prompt.
        //
        // When `suppressEcho` is set (decrypt/admin password, admin username),
        // we also OMIT the echo from the rendered transcript — only the
        // `output` block (decrypt bar, auth failure note, etc.) is appended.
        // Without this, the transcript would persist either bullet runs or
        // plaintext usernames after submission, which felt wrong.
        if (action.suppressEcho) {
            addCommand('', output, { skipHistory: true, hideCommandHeader: true });
            return;
        }
        addCommand(echo, output, { skipHistory: true });
    }, [addCommand]);

    const executeTerminalLine = React.useCallback(async (trimmedInput: string): Promise<boolean> => {
        const [cmd, ...args] = trimmedInput.split(/\s+/);
        const lowerCmd = cmd.toLowerCase();

        soundManager.play('terminal-click');
        unlockSticker('first-word');

        if (lowerCmd === 'clear') {
            addToHistory("clear");
            clearOutput();
            clearHaptic();
            return true;
        }

        if (TERMINAL_COMMAND_NAME_SET.has(lowerCmd)) {
            submit();
        }

        let commandDef: CommandHandler | undefined;
        if (TERMINAL_COMMAND_NAME_SET.has(lowerCmd)) {
            try {
                const commandRegistry = await getCommandRegistry();
                commandDef = commandRegistry[lowerCmd];
            } catch (error) {
                console.error('Command registry load error:', error);
                errorHaptic();
                addCommand(trimmedInput, <span className={TERMINAL_COLORS.error}>Error loading command module.</span>);
                return false;
            }
        }

        let output: React.ReactNode;
        let action: (() => void) | undefined;

        if (commandDef) {
            try {
                const result = await commandDef(args);
                output = result.output;
                action = result.action;
                if (isPublicTerminalCommand(lowerCmd)) {
                    appendUserAction({ kind: 'terminal.run', command: lowerCmd });
                }
            } catch (error) {
                console.error('Command execution error:', error);
                errorHaptic();
                output = <span className={TERMINAL_COLORS.error}>Error executing command.</span>;
            }
        } else {
            warning();
            output = (
                <div>
                    <span className={TERMINAL_COLORS.error}>Command not found: {lowerCmd}</span>
                    <br />
                    <span className="text-gray-400">Type <span className={TERMINAL_COLORS.prompt}>&apos;help&apos;</span> for available commands.</span>
                </div>
            );
        }

        addCommand(trimmedInput, output);
        action?.();
        return Boolean(commandDef);
    }, [
        addCommand,
        addToHistory,
        clearHaptic,
        clearOutput,
        errorHaptic,
        getCommandRegistry,
        submit,
        warning,
    ]);

    useEffect(() => {
        const handler = (raw: Event) => {
            const event = raw as CustomEvent<RunTerminalCommandEventDetail>;
            const command = resolveVoiceSafeTerminalCommand(event.detail);
            if (!command) {
                attachSiteActionResult(event, {
                    ok: false,
                    spokenText: 'That terminal command is not available.',
                    errorCode: 'terminal-unsafe',
                });
                return;
            }
            if (activePrompt) {
                attachSiteActionResult(event, {
                    ok: false,
                    spokenText: 'The terminal is waiting for a typed answer first.',
                    errorCode: 'terminal-busy',
                });
                return;
            }
            attachSiteActionResult(event, executeTerminalLine(command).then((accepted) => (
                accepted
                    ? {
                        ok: true,
                        spokenText: `Queued ${command}.`,
                        data: { command, accepted: true, nextAction: 'Want another safe command, like about or projects?' },
                    }
                    : {
                        ok: false,
                        spokenText: 'The terminal is not open on this page.',
                        errorCode: 'terminal-unavailable',
                    }
            )));
        };
        const unregister = registerSiteActionHost('terminal');
        window.addEventListener(RUN_TERMINAL_COMMAND_EVENT, handler);
        return () => {
            unregister();
            window.removeEventListener(RUN_TERMINAL_COMMAND_EVENT, handler);
        };
    }, [activePrompt, executeTerminalLine]);

    const handleCommand = React.useCallback(async (e: React.FormEvent) => {
        e.preventDefault();

        // If a prompt is active, route the raw input (no lowercasing, no
        // tokenization) straight to its handler.
        if (activePrompt) {
            const rawValue = input;
            updateInput("");
            soundManager.play('terminal-click');
            submit();
            try {
                const result = await activePrompt.onSubmit(rawValue, { router });
                applyPromptAction(result, rawValue);
            } catch (err) {
                console.error('Prompt handler error:', err);
                errorHaptic();
                setActivePrompt(null);
                addCommand('', <span className={TERMINAL_COLORS.error}>Error processing input.</span>, {
                    skipHistory: true,
                    hideCommandHeader: true,
                });
            }
            return;
        }

        const trimmedInput = input.trim();
        if (!trimmedInput) return;
        await executeTerminalLine(trimmedInput);
        updateInput("");
        setHistoryIndex(-1);
    }, [
        input,
        executeTerminalLine,
        errorHaptic,
        submit,
        activePrompt,
        applyPromptAction,
        updateInput,
        router,
        addCommand,
    ]);

    // Better History Logic Implementation
    const navigateHistory = React.useCallback((direction: 'up' | 'down') => {
        if (commandHistory.length === 0) return;

        let newIndex = historyIndex;
        if (direction === 'up') {
            if (historyIndex < commandHistory.length - 1) {
                newIndex++;
            }
        } else {
            if (historyIndex > -1) {
                newIndex--;
            }
        }

        setHistoryIndex(newIndex);

        if (newIndex === -1) {
            updateInput("");
        } else {
            // history is [oldest, ..., newest]
            // up arrow (index 0) -> newest (length - 1)
            const targetCommand = commandHistory[commandHistory.length - 1 - newIndex];
            updateInput(targetCommand);
        }
    }, [commandHistory, historyIndex, updateInput]);

    // On mobile the virtual keyboard can cover the input. Wait for the keyboard
    // animation (~250ms on iOS) and then scroll the input back into the visible
    // viewport. Works for both iOS Safari and Android Chrome since scrollIntoView
    // walks all scrollable ancestors.
    const handleInputFocus = React.useCallback(() => {
        setIsInputFocused(true);
        warmCommandRegistry();
        if (isDesktopViewport()) return;
        window.setTimeout(() => {
            inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 320);
    }, [warmCommandRegistry]);

    const handleInputBlur = React.useCallback(() => {
        setIsInputFocused(false);
    }, []);

    const handleKeyDownReal = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        // During an inline prompt, disable command history + tab-complete —
        // the user is entering a password/username, not a command.
        if (activePrompt) {
            if (e.key === 'Escape') {
                e.preventDefault();
                const cancelResult = activePrompt.onCancel?.() ?? null;
                setActivePrompt(null);
                updateInput('');
                if (cancelResult) {
                    applyPromptAction(cancelResult, '');
                }
            }
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            navigateHistory('up');
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            navigateHistory('down');
        } else if (e.key === "Tab") {
            e.preventDefault();
            const completion = completeTerminalCommandInput(input, completionSessionRef.current);
            completionSessionRef.current = completion.session;
            if (completion.completed) {
                setInput(completion.value);
            }
        }
    }, [navigateHistory, input, activePrompt, applyPromptAction, updateInput]);



    return (
        <div
            className="w-full max-w-[var(--c-terminal-max-w)] mx-auto relative group perspective-[1000px]"
            data-disco-motion="wiggle"
        >
            {/* Rough Shadow */}
            <div
                className="absolute inset-0 bg-black/8 rounded-lg transform translate-x-1 translate-y-2 md:translate-x-2 md:translate-y-3 rotate-2 pointer-events-none"
                style={shadowStyle}
            />

            {/* Terminal Container - Charcoal Block */}
            <div
                className={`relative ${TERMINAL_COLORS.text} overflow-hidden border-[3px] ${TERMINAL_COLORS.border}`}
                style={containerStyle}
            >
                {/* Sketchy Header */}
                <div
                    className={`p-3 flex items-center justify-between border-b-2 ${TERMINAL_COLORS.headerBorder} relative overflow-hidden`}
                    style={headerStyle}
                >
                    {/* Scribble Noise Texture for Header */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={noiseStyle} />

                    {/* Sketchy Window Controls */}
                    <WindowControls />

                    <p className={`min-w-0 truncate ${TERMINAL_COLORS.headerLabel} font-hand text-[length:var(--t-hand-sm)] md:text-lg relative z-10`}>
                        Dhruv&apos;s terminal
                    </p>
                    <div className="w-8 sm:w-16"></div>
                </div>

                {/* Body - Chalkboard Vibe */}
                <div className="relative">
                <div
                    ref={scrollRef}
                    className="@container p-4 md:p-6 h-[var(--c-terminal-h)] md:h-[var(--c-terminal-h-md)] overflow-y-auto font-code text-sm md:text-base scrollbar-hidden selection:bg-gray-600 selection:text-white focus-within:ring-2 focus-within:ring-inset focus-within:ring-emerald-400/45"
                    onClick={() => {
                        // Only auto-focus on click for desktop to prevent annoying keyboard popups on mobile scroll
                        if (isDesktopViewport()) {
                            inputRef.current?.focus();
                        }
                    }}
                >
                    <TerminalOutput outputLines={outputLines} />

                    <form onSubmit={handleCommand} className="flex gap-x-[1ch] items-center mt-4">
                        {activePrompt ? (
                            <span className="font-bold">{activePrompt.label}</span>
                        ) : (
                            <TerminalPrompt />
                        )}
                        <div className="relative flex-1">
                            {activePrompt?.masked ? (
                                <input
                                    ref={inputRef}
                                    id="terminal-command-input"
                                    name="terminal-command"
                                    type="password"
                                    value={input}
                                    onChange={(e) => updateInput(e.target.value)}
                                    onKeyDown={handleKeyDownReal}
                                    onFocus={handleInputFocus}
                                    onBlur={handleInputBlur}
                                    className={`bg-transparent border-none outline-none text-white w-full ${TERMINAL_COLORS.caret}`}
                                    autoComplete="new-password"
                                    aria-label={`Terminal prompt: ${activePrompt.id}`}
                                    // iOS Safari zoom-on-focus fix: font-size must be ≥ 16px.
                                    // Fira Code at 16px on mobile is still compact enough, and
                                    // prevents the viewport from auto-zooming when the user
                                    // taps the password field.
                                    style={{ fontSize: '16px' }}
                                    spellCheck={false}
                                    autoCapitalize="off"
                                    autoCorrect="off"
                                    inputMode="text"
                                />
                            ) : (
                                <input
                                    ref={inputRef}
                                    id="terminal-command-input"
                                    name="terminal-command"
                                    type="text"
                                    value={input}
                                    onChange={(e) => updateInput(e.target.value)}
                                    onKeyDown={handleKeyDownReal}
                                    onFocus={handleInputFocus}
                                    onBlur={handleInputBlur}
                                    className={`bg-transparent border-none outline-none text-white w-full [caret-shape:block] ${TERMINAL_COLORS.caret}`}
                                    autoComplete="off"
                                    aria-label={activePrompt ? `Terminal prompt: ${activePrompt.id}` : "Terminal Command Input"}
                                    data-voice-field={activePrompt ? undefined : "terminal-input"}
                                    placeholder=""
                                    style={activePrompt ? { fontSize: '16px' } : undefined}
                                    spellCheck={activePrompt ? false : undefined}
                                    autoCapitalize={activePrompt ? 'off' : undefined}
                                    autoCorrect={activePrompt ? 'off' : undefined}
                                />
                            )}
                            {isPlaceholderActive && (
                                <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre font-code text-base"
                                >
                                    <span ref={placeholderRef} data-terminal-placeholder className="truncate text-gray-400" />
                                    <span className={`terminal-cursor ${TERMINAL_COLORS.cursor}`} />
                                </span>
                            )}
                        </div>
                    </form>
                </div>
                <PillScrollbar scrollRef={scrollRef} color={TERMINAL_COLORS.scrollbarColor} />
                </div>
            </div>
        </div>
    );
}
