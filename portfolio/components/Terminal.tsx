"use client";

import React, { useState, useEffect, useRef } from "react";
import { m } from "framer-motion";
import { Terminal as TerminalIcon } from "lucide-react";
import { useTerminal } from "@/context/TerminalContext";
import { trackTerminalCommand } from "@/lib/analytics";
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
import { WindowControls } from "./DoodleIcons";
import PillScrollbar from "@/components/PillScrollbar";

export default function Terminal() {
    const { outputLines, commandHistory, addCommand, addToHistory, clearOutput } = useTerminal();
    const router = useRouter(); // Correctly using hook inside component

    const [input, setInput] = useState("");
    const [historyIndex, setHistoryIndex] = useState(-1);

    const inputRef = useRef<HTMLInputElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const isInitialMount = useRef(true);

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

    const handleCommand = React.useCallback(async (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedInput = input.trim();
        if (!trimmedInput) return;

        // Split into command and args
        const [cmd, ...args] = trimmedInput.split(/\s+/);
        const lowerCmd = cmd.toLowerCase();

        // Track command usage
        trackTerminalCommand(lowerCmd);

        // Special handling for 'clear'
        if (lowerCmd === 'clear') {
            addToHistory("clear");
            clearOutput();
            setInput("");
            return;
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
                output = <span className={TERMINAL_COLORS.error}>Error executing command.</span>;
            }
        } else {
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
    }, [input, addCommand, addToHistory, clearOutput, COMMAND_REGISTRY]);

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

    const handleKeyDownReal = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
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
    }, [navigateHistory, input, AVAILABLE_COMMANDS]);



    return (
        <m.div
            initial={INTERACTION_TOKENS.entrance.scaleRotate.initial}
            animate={INTERACTION_TOKENS.entrance.scaleRotate.animate}
            transition={{ duration: ANIMATION_TOKENS.duration.slow, type: "spring", bounce: 0.4 }}
            className="w-full max-w-[var(--c-terminal-max-w)] mx-auto relative group perspective-[1000px]"
            suppressHydrationWarning
        >
            {/* Rough Shadow */}
            <div
                className="absolute inset-0 bg-black/8 rounded-lg transform translate-x-2 translate-y-3 rotate-2 pointer-events-none"
                style={{ borderRadius: SKETCH_RADIUS.terminal }}
            />

            {/* Terminal Container - Charcoal Block */}
            <div
                className={`relative ${TERMINAL_COLORS.text} overflow-hidden border-[3px] ${TERMINAL_COLORS.border} shadow-inner`}
                style={{
                    borderRadius: SKETCH_RADIUS.terminal,
                    boxShadow: SHADOW_TOKENS.terminal,
                    backgroundColor: TERMINAL_COLORS.bg,
                }}
            >
                {/* Sketchy Header */}
                <div
                    className={`p-3 flex items-center justify-between border-b-2 ${TERMINAL_COLORS.headerBorder} relative overflow-hidden`}
                    style={{ backgroundColor: TERMINAL_COLORS.headerBg }}
                >
                    {/* Scribble Noise Texture for Header */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: HEADER_NOISE_SVG }} />

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

                    <form onSubmit={handleCommand} className="flex gap-3 items-center mt-4">
                        <span className={`${TERMINAL_COLORS.prompt} font-bold`}>➜</span>
                        <span className={`${TERMINAL_COLORS.directory} font-bold`}>~</span>
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDownReal}
                            className={`bg-transparent border-none outline-none text-white flex-1 ${TERMINAL_COLORS.caret} ${TERMINAL_COLORS.placeholder}`}
                            autoComplete="off"
                            aria-label="Terminal Command Input"
                            placeholder="Type a command..."
                        />
                    </form>
                    <div ref={bottomRef} />
                </div>
                <PillScrollbar scrollRef={scrollRef} color={TERMINAL_COLORS.scrollbarColor} />
                </div>
            </div>
        </m.div>
    );
}
