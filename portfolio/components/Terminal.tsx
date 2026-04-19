"use client";

import React, { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { m } from "framer-motion";
import { Terminal as TerminalIcon } from "lucide-react";
import { useTerminal } from "@/context/TerminalContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAppHaptics } from "@/lib/haptics";
import { trackTerminalCommand } from "@/lib/analytics";
import { stickerBus } from "@/lib/stickerBus";
import { soundManager } from "@/lib/soundManager";
import { recordTerminalCommandImperative } from "@/hooks/useStickers";
import { useRouter } from "next/navigation";
import { HEADER_NOISE_SVG } from "@/lib/assets";
import {
    TERMINAL_COLORS,
    SKETCH_RADIUS,
    SHADOW_TOKENS,
    INTERACTION_TOKENS,
    ANIMATION_TOKENS,
    LAYOUT_TOKENS,
} from "@/lib/designTokens";
import { createCommandRegistry } from "@/lib/terminalCommands";
import {
    getActivePrompt,
    subscribeToPrompts,
    setActivePrompt,
    type PromptSubmitAction,
} from "@/lib/terminalPrompts";
import { WindowControls } from "./DoodleIcons";
import PillScrollbar from "@/components/PillScrollbar";
import { useTerminalPlaceholder } from "@/hooks/useTerminalPlaceholder";

// Hoisted style objects to avoid re-creating on every render
const shadowStyle = { borderRadius: SKETCH_RADIUS.terminal } as const;
const containerStyle = {
    borderRadius: SKETCH_RADIUS.terminal,
    boxShadow: SHADOW_TOKENS.terminal,
    backgroundColor: TERMINAL_COLORS.bg,
} as const;
const containerStyleMobile = {
    borderRadius: SKETCH_RADIUS.terminal,
    boxShadow: 'inset 0 0 18px rgba(0,0,0,0.32)',
    backgroundColor: TERMINAL_COLORS.bg,
} as const;
const headerStyle = { backgroundColor: TERMINAL_COLORS.headerBg } as const;
const noiseStyle = { backgroundImage: HEADER_NOISE_SVG } as const;

// Memoised output area — only re-renders when outputLines changes, not on every keystroke
interface TerminalOutputProps {
    outputLines: { id: number; command: string; output: React.ReactNode }[];
}

const TerminalOutput = React.memo(function TerminalOutput({ outputLines }: TerminalOutputProps) {
    return (
        <>
            {outputLines.map((item) => (
                <div key={item.id} className="mb-4">
                    <div className="flex gap-3 opacity-90">
                        <span className={`${TERMINAL_COLORS.prompt} font-bold`}>➜</span>
                        <span className={`${TERMINAL_COLORS.directory} font-bold`}>~</span>
                        <span className={TERMINAL_COLORS.command}>{item.command}</span>
                    </div>
                    {item.output && (
                        <div className={`ml-7 mt-2 ${TERMINAL_COLORS.output} tracking-wide leading-relaxed border-l-2 ${TERMINAL_COLORS.border} pl-3`}>
                            {item.output}
                        </div>
                    )}
                </div>
            ))}
        </>
    );
});

const getServerPromptSnapshot = () => null;

export default function Terminal() {
    const { outputLines, commandHistory, addCommand, addToHistory, clearOutput } = useTerminal();
    const isMobile = useIsMobile();
    const { clear: clearHaptic, error: errorHaptic, submit, warning } = useAppHaptics();
    const router = useRouter(); // Correctly using hook inside component

    const [input, setInput] = useState("");
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [hasInteracted, setHasInteracted] = useState(false);

    // Inline prompt subscription. When non-null, the next Enter-press is
    // routed to the prompt's `onSubmit` instead of the command registry.
    const activePrompt = useSyncExternalStore(subscribeToPrompts, getActivePrompt, getServerPromptSnapshot);

    const inputRef = useRef<HTMLInputElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const isInitialMount = useRef(true);

    // When a prompt activates, auto-focus the input and clear any leftover text
    // so the user can start typing the password / username immediately.
    useEffect(() => {
        if (!activePrompt) return;
        setInput("");
        // Desktop: focus immediately. Mobile: don't pop the keyboard
        // unsolicited — the user already tapped to trigger the prompt
        // chain, so focus is usually preserved anyway.
        if (typeof window !== 'undefined' && window.innerWidth >= LAYOUT_TOKENS.mobileBreakpoint) {
            window.setTimeout(() => inputRef.current?.focus(), 30);
        }
    }, [activePrompt]);

    // Typewritten placeholder — cycles command hints while the input is empty.
    // Stops automatically the moment the user types anything (overlay unmounts).
    // Also disabled while a prompt (password/username) is active so the
    // placeholder doesn't distract from the request being made.
    const placeholderRef = useTerminalPlaceholder(!input && activePrompt === null);

    // Command Registry defined outside
    const COMMAND_REGISTRY = React.useMemo(() => createCommandRegistry(router), [router]);

    const AVAILABLE_COMMANDS = React.useMemo(() => Object.keys(COMMAND_REGISTRY), [COMMAND_REGISTRY]);

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
        } else {
            // Use block: 'nearest' to prevent scrolling the whole page on mobile
            bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }, [outputLines]);

    const applyPromptAction = React.useCallback((action: PromptSubmitAction, rawText: string) => {
        const echo = action.echo ?? rawText;
        const output = action.output ?? null;
        // Inline-prompt submissions must NEVER appear in the command-history
        // ring (↑/↓ arrows). That would leak passwords/usernames and surface
        // bare echoes like "•••••" at the main `➜ ~` prompt. We still render
        // the echo inline via addCommand(...) so the transcript shows what
        // was typed, but we skip addToHistory entirely for prompt input.
        addCommand(echo, output, { skipHistory: true });
    }, [addCommand]);

    const handleCommand = React.useCallback(async (e: React.FormEvent) => {
        e.preventDefault();

        // If a prompt is active, route the raw input (no lowercasing, no
        // tokenization) straight to its handler.
        if (activePrompt) {
            const rawValue = input;
            setInput("");
            soundManager.play('terminal-click');
            submit();
            try {
                const result = await activePrompt.onSubmit(rawValue, { router });
                applyPromptAction(result, rawValue);
            } catch (err) {
                console.error('Prompt handler error:', err);
                errorHaptic();
                setActivePrompt(null);
                addCommand(rawValue, <span className={TERMINAL_COLORS.error}>Error processing input.</span>);
            }
            return;
        }

        const trimmedInput = input.trim();
        if (!trimmedInput) return;

        // Split into command and args
        const [cmd, ...args] = trimmedInput.split(/\s+/);
        const lowerCmd = cmd.toLowerCase();

        // Track command usage
        trackTerminalCommand(lowerCmd);

        // Play a subtle typewriter click on command execute. Debounced
        // inside the manager so rapid commands don't machine-gun the user.
        soundManager.play('terminal-click');

        // Sticker emits (idempotent — hook deduplicates by id)
        stickerBus.emit('first-word');
        if (lowerCmd === 'help') {
            stickerBus.emit('help-wanted');
        } else if (lowerCmd === 'joke') {
            stickerBus.emit('stand-up-comic');
        }

        // Track distinct command count — unlock `terminal-addict` at 5.
        // Only count real commands (not empty/whitespace). COMMAND_REGISTRY
        // membership isn't required — the spirit is "five distinct attempts",
        // though we normalize to the lowercase first-token.
        const distinctCount = recordTerminalCommandImperative(lowerCmd);
        if (distinctCount >= 5) {
            stickerBus.emit('terminal-addict');
        }

        // Special handling for 'clear'
        if (lowerCmd === 'clear') {
            addToHistory("clear");
            clearOutput();
            clearHaptic();
            setInput("");
            return;
        }

        if (COMMAND_REGISTRY[lowerCmd]) {
            submit();
        }

        const commandDef = COMMAND_REGISTRY[lowerCmd];
        let output: React.ReactNode;

        if (commandDef) {
            try {
                // Pass args to the command function
                // Await result in case it's a promise
                const result = await commandDef(args);
                output = result.output;
                if (result.action) {
                    result.action();
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

        // Add original input string to history
        addCommand(trimmedInput, output);
        setInput("");
        setHistoryIndex(-1); // Reset history pointer
    }, [
        input,
        addCommand,
        addToHistory,
        clearHaptic,
        clearOutput,
        COMMAND_REGISTRY,
        errorHaptic,
        submit,
        warning,
        activePrompt,
        applyPromptAction,
        router,
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
            setInput("");
        } else {
            // history is [oldest, ..., newest]
            // up arrow (index 0) -> newest (length - 1)
            const targetCommand = commandHistory[commandHistory.length - 1 - newIndex];
            setInput(targetCommand);
        }
    }, [commandHistory, historyIndex]);

    // On mobile the virtual keyboard can cover the input. Wait for the keyboard
    // animation (~250ms on iOS) and then scroll the input back into the visible
    // viewport. Works for both iOS Safari and Android Chrome since scrollIntoView
    // walks all scrollable ancestors.
    const handleInputFocus = React.useCallback(() => {
        if (!hasInteracted) setHasInteracted(true);
        if (typeof window === 'undefined') return;
        if (window.innerWidth >= LAYOUT_TOKENS.mobileBreakpoint) return;
        window.setTimeout(() => {
            inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 320);
    }, [hasInteracted]);

    const handleKeyDownReal = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        // During an inline prompt, disable command history + tab-complete —
        // the user is entering a password/username, not a command.
        if (activePrompt) {
            if (e.key === 'Escape') {
                e.preventDefault();
                const cancelResult = activePrompt.onCancel?.() ?? null;
                setActivePrompt(null);
                setInput('');
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
            const [cmd] = input.trim().split(/\s+/); // only autocomplete first word
            const match = AVAILABLE_COMMANDS.find(c => c.startsWith(cmd));
            if (match) {
                setInput(match);
            }
        }
    }, [navigateHistory, input, AVAILABLE_COMMANDS, activePrompt, applyPromptAction]);



    return (
        <m.div
            initial={INTERACTION_TOKENS.entrance.scaleRotate.initial}
            animate={INTERACTION_TOKENS.entrance.scaleRotate.animate}
            transition={{ duration: ANIMATION_TOKENS.duration.slow, type: "spring", bounce: 0.4 }}
            className="w-full max-w-[var(--c-terminal-max-w)] mx-auto relative group perspective-[1000px]"
            suppressHydrationWarning
            /* Disco mode: the terminal shell gets a gentle "breath" pulse — a
               slow 2s scale cycle so the largest surface on the home page is
               alive with the beat without shifting the reading plane of the
               text inside. Targeted via a site-wide selector on the
               .perspective-[1000px] class; keeping the attribute here makes
               the intent explicit for future maintainers. */
            data-disco-motion="breath"
        >
            {/* Rough Shadow */}
            <div
                className="absolute inset-0 bg-black/8 rounded-lg transform translate-x-1 translate-y-2 md:translate-x-2 md:translate-y-3 rotate-2 pointer-events-none"
                style={shadowStyle}
            />

            {/* Terminal Container - Charcoal Block */}
            <div
                className={`relative ${TERMINAL_COLORS.text} overflow-hidden border-[3px] ${TERMINAL_COLORS.border} shadow-inner`}
                style={isMobile ? containerStyleMobile : containerStyle}
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

                    <div className={`flex items-center gap-2 ${TERMINAL_COLORS.headerLabel} font-hand text-lg tracking-widest uppercase relative z-10`}>
                        <TerminalIcon size={16} className="text-gray-500" />
                        <span>Dhruv&apos;s Terminal v1.0</span>
                    </div>
                    <div className="w-16"></div>
                </div>

                {/* Body - Chalkboard Vibe */}
                <div className="relative">
                <div
                    ref={scrollRef}
                    className="p-4 md:p-6 h-[var(--c-terminal-h)] min-h-[var(--c-terminal-min-h)] md:h-[var(--c-terminal-h-md)] overflow-y-auto font-code text-sm md:text-base scrollbar-hidden selection:bg-gray-600 selection:text-white"
                    onClick={() => {
                        // Only auto-focus on click for desktop to prevent annoying keyboard popups on mobile scroll
                        if (typeof window !== 'undefined' && window.innerWidth >= LAYOUT_TOKENS.mobileBreakpoint) {
                            inputRef.current?.focus();
                        }
                    }}
                >
                    <TerminalOutput outputLines={outputLines} />

                    {/* Mobile-only interactability cue — sits above the prompt and fades out
                        once the user taps the input. Matches the terminal's own aesthetic
                        (monospace, emerald glow) so it doesn't clash with the sketchbook. */}
                    {!hasInteracted && (
                        <div className="md:hidden flex items-center gap-2 mt-3 mb-1 text-xs font-mono text-emerald-300/70 italic animate-pulse select-none">
                            <span aria-hidden="true">↓</span>
                            <span>tap below to type a command</span>
                        </div>
                    )}

                    <form onSubmit={handleCommand} className="flex gap-3 items-center mt-4">
                        {activePrompt ? (
                            <span className="font-bold">{activePrompt.label}</span>
                        ) : (
                            <>
                                <span className={`${TERMINAL_COLORS.prompt} font-bold`}>➜</span>
                                <span className={`${TERMINAL_COLORS.directory} font-bold`}>~</span>
                            </>
                        )}
                        <div className="relative flex-1">
                            {activePrompt?.masked ? (
                                <input
                                    ref={inputRef}
                                    type="password"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDownReal}
                                    onFocus={handleInputFocus}
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
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDownReal}
                                    onFocus={handleInputFocus}
                                    className={`bg-transparent border-none outline-none text-white w-full ${TERMINAL_COLORS.caret}`}
                                    autoComplete="off"
                                    aria-label={activePrompt ? `Terminal prompt: ${activePrompt.id}` : "Terminal Command Input"}
                                    placeholder=""
                                    style={activePrompt ? { fontSize: '16px' } : undefined}
                                    spellCheck={activePrompt ? false : undefined}
                                    autoCapitalize={activePrompt ? 'off' : undefined}
                                    autoCorrect={activePrompt ? 'off' : undefined}
                                />
                            )}
                            {!input && !activePrompt && (
                                <span
                                    ref={placeholderRef}
                                    aria-hidden="true"
                                    className="pointer-events-none absolute left-0 top-0 right-0 text-gray-500 font-code text-sm md:text-base leading-[inherit] whitespace-nowrap overflow-hidden"
                                />
                            )}
                        </div>
                    </form>
                    <div ref={bottomRef} />
                </div>
                <PillScrollbar scrollRef={scrollRef} color={TERMINAL_COLORS.scrollbarColor} />
                </div>
            </div>
        </m.div>
    );
}
