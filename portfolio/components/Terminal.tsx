"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Terminal as TerminalIcon } from "lucide-react";
import { useTerminal } from "@/context/TerminalContext";
import { trackTerminalCommand } from "@/lib/analytics";
import { useRouter } from "next/navigation";
import { HEADER_NOISE_SVG } from "@/lib/assets";
import { createCommandRegistry } from "@/lib/terminalCommands";

export default function Terminal() {
    const { outputLines, commandHistory, addCommand, addToHistory, clearOutput } = useTerminal();
    const router = useRouter(); // Correctly using hook inside component

    const [input, setInput] = useState("");
    const [historyIndex, setHistoryIndex] = useState(-1);

    const inputRef = useRef<HTMLInputElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const isInitialMount = useRef(true);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Command Registry defined outside
    const COMMAND_REGISTRY = React.useMemo(() => createCommandRegistry(router), [router]);

    const AVAILABLE_COMMANDS = React.useMemo(() => Object.keys(COMMAND_REGISTRY), [COMMAND_REGISTRY]);

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
        } else {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
                output = <span className="text-red-400">Error executing command.</span>;
            }
        } else {
            output = (
                <div>
                    <span className="text-red-400">Command not found: {lowerCmd}</span>
                    <br />
                    <span className="text-gray-400">Type <span className="text-emerald-400">&apos;help&apos;</span> for available commands.</span>
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

    if (!mounted) {
        return <div className="h-[400px] animate-pulse bg-gray-800/10 rounded-lg border-2 border-dashed border-gray-300" />;
    }

    return (
        <motion.div
            initial={{ scale: 0.95, opacity: 0, rotate: 1 }}
            animate={{ scale: 1, opacity: 1, rotate: -1 }}
            transition={{ duration: 0.5, type: "spring", bounce: 0.4 }}
            className="w-full max-w-3xl mx-auto relative group perspective-[1000px]"
            suppressHydrationWarning
        >
            {/* Rough Shadow */}
            <div
                className="absolute inset-0 bg-black/10 rounded-lg transform translate-x-2 translate-y-3 rotate-2 blur-sm pointer-events-none"
                style={{ borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}
            />

            {/* Terminal Container - Charcoal Block */}
            <div
                className="relative bg-[#2d2a2e] text-gray-200 overflow-hidden border-[3px] border-gray-700/50 shadow-inner"
                style={{
                    borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
                    boxShadow: "inset 0 0 40px rgba(0,0,0,0.5)"
                }}
            >
                {/* Sketchy Header */}
                <div className="bg-[#383436] p-3 flex items-center justify-between border-b-2 border-gray-600/30 relative overflow-hidden">
                    {/* Scribble Noise Texture for Header */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: HEADER_NOISE_SVG }} />

                    {/* Sketchy Window Controls */}
                    <div className="flex gap-3 relative z-10 pl-2">
                        {/* Red Scribble */}
                        <div className="w-4 h-4 text-red-400/80 hover:text-red-400 transition-colors cursor-pointer">
                            <svg viewBox="0 0 100 100" fill="currentColor"><path d="M50 5 Q80 5 90 30 Q95 60 70 85 Q40 95 15 70 Q5 40 20 15 Q35 5 50 5 Z" /></svg>
                        </div>
                        {/* Yellow Scribble */}
                        <div className="w-4 h-4 text-amber-400/80 hover:text-amber-400 transition-colors cursor-pointer">
                            <svg viewBox="0 0 100 100" fill="currentColor"><path d="M45 5 Q75 10 90 35 Q95 70 65 90 Q35 95 10 70 Q5 35 25 10 Q45 5 45 5 Z" /></svg>
                        </div>
                        {/* Green Scribble */}
                        <div className="w-4 h-4 text-emerald-400/80 hover:text-emerald-400 transition-colors cursor-pointer">
                            <svg viewBox="0 0 100 100" fill="currentColor"><path d="M55 5 Q85 15 90 45 Q85 80 55 90 Q25 85 15 55 Q10 25 40 10 Q55 5 55 5 Z" /></svg>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-gray-400/60 font-hand text-lg tracking-widest uppercase relative z-10">
                        <TerminalIcon size={16} className="text-gray-500" />
                        <span>Dhruv&apos;s Terminal v1.0</span>
                    </div>
                    <div className="w-16"></div>
                </div>

                {/* Body - Chalkboard Vibe */}
                <div
                    className="p-4 md:p-6 h-[50vh] min-h-[300px] md:h-[400px] overflow-y-auto font-code text-sm md:text-base scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent selection:bg-gray-600 selection:text-white"
                    onClick={() => {
                        // Only auto-focus on click for desktop to prevent annoying keyboard popups on mobile scroll
                        if (typeof window !== 'undefined' && window.innerWidth >= 768) {
                            inputRef.current?.focus();
                        }
                    }}
                >
                    {outputLines.map((item, i) => (
                        <div key={i} className="mb-4">
                            <div className="flex gap-3 opacity-90">
                                <span className="text-emerald-400 font-bold">➜</span>
                                <span className="text-blue-300 font-bold">~</span>
                                <span className="text-gray-100">{item.command}</span>
                            </div>
                            {item.output && (
                                <div className="ml-7 mt-2 text-gray-300/90 tracking-wide leading-relaxed border-l-2 border-gray-700/50 pl-3">
                                    {item.output}
                                </div>
                            )}
                        </div>
                    ))}

                    <form onSubmit={handleCommand} className="flex gap-3 items-center mt-4">
                        <span className="text-emerald-400 font-bold">➜</span>
                        <span className="text-blue-300 font-bold">~</span>
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDownReal}
                            className="bg-transparent border-none outline-none text-white flex-1 caret-emerald-400 placeholder-gray-600"
                            autoComplete="off"
                            aria-label="Terminal Command Input"
                            placeholder="Type a command..."
                        />
                    </form>
                    <div ref={bottomRef} />
                </div>
            </div>
        </motion.div>
    );
}
