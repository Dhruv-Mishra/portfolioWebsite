"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Terminal as TerminalIcon } from "lucide-react";

interface Command {
    command: string;
    output: React.ReactNode;
}

export default function Terminal() {
    const [input, setInput] = useState("");
    const [history, setHistory] = useState<Command[]>([
        {
            command: "init",
            output: (
                <div className="text-gray-400 text-sm font-mono leading-relaxed">
                    <p className="text-emerald-400 mb-2">Initializing Portfolio v1.0.0...</p>
                    <p className="mb-1">[✓] Loading Graphics Engine....... <span className="text-emerald-500">Done</span></p>
                    <p className="mb-1">[✓] Connecting to Creativity DB... <span className="text-emerald-500">Done</span></p>
                    <p className="mb-1">[✓] Fetching Coffee............... <span className="text-emerald-500">Done</span></p>
                    <p className="mt-4 text-white">System Ready. <span className="text-gray-500">Type 'help' for commands.</span></p>
                </div>
            )
        },
    ]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Commands list for autocomplete
    const AVAILABLE_COMMANDS = ["help", "about", "projects", "contact", "clear", "init"];

    const inputRef = useRef<HTMLInputElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [history]);

    const handleCommand = (e: React.FormEvent) => {
        e.preventDefault();
        const cmd = input.trim().toLowerCase();
        if (!cmd) return;

        let output: React.ReactNode = "";

        switch (cmd) {
            case "help":
                output = (
                    <div className="space-y-1">
                        <p>Available commands:</p>
                        <p className="pl-4 text-emerald-400">about    - Who is Dhruv?</p>
                        <p className="pl-4 text-emerald-400">projects - View my work</p>
                        <p className="pl-4 text-emerald-400">contact  - Get in touch</p>
                        <p className="pl-4 text-emerald-400">clear    - Clear terminal</p>
                        <p className="pl-4 text-emerald-400">init     - System status</p>
                    </div>
                );
                break;
            case "clear":
                setHistory([]);
                setInput("");
                return;
            case "about":
                output = "Dhruv is a frontend engineer with a passion for creative UI. I build things that live on the web.";
                break;
            case "contact":
                output = "Email: dhruv@example.com | GitHub: @dhruv";
                break;
            case "projects":
                output = "Check out the projects on the main page!";
                break;
            case "init":
                output = (
                    <span className="text-yellow-400">
                        System already initialized. <br />
                        &gt; Uptime: <span className="text-gray-400">{Math.floor(performance.now() / 1000)}s</span> <br />
                        &gt; Status: <span className="text-green-400">Stable</span>
                    </span>
                );
                break;
            default:
                output = `Command not found: ${cmd}. Type 'help' for available commands.`;
        }

        const newHistoryItem = { command: input, output };
        setHistory((prev) => [...prev, newHistoryItem]);
        setInput("");
        setHistoryIndex(-1); // Reset history pointer
    };

    // Better History Logic Implementation
    const navigateHistory = (direction: 'up' | 'down') => {
        const userHistory = history.filter(h => h.command !== 'init'); // Filter out system messages if any (init is fine though)
        // Actually our init has a command "init" so it's fine.

        if (history.length === 0) return;

        let newIndex = historyIndex;
        if (direction === 'up') {
            if (historyIndex < history.length - 1) {
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
            // up arrow (index 1) -> second newest (length - 2)
            const targetCommand = history[history.length - 1 - newIndex].command;
            setInput(targetCommand);
        }
    };

    const handleKeyDownReal = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowUp") {
            e.preventDefault();
            navigateHistory('up');
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            navigateHistory('down');
        } else if (e.key === "Tab") {
            e.preventDefault();
            const match = AVAILABLE_COMMANDS.find(cmd => cmd.startsWith(input));
            if (match) {
                setInput(match);
            }
        }
    };

    return (
        <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-3xl mx-auto bg-[#0a0a0a] rounded-lg shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden font-code text-sm md:text-base border border-gray-800"
        >
            {/* Header */}
            <div className="bg-[#1f1f1f] px-4 py-2 flex items-center justify-between border-b border-gray-800">
                <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors" />
                    <div className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors" />
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                    <TerminalIcon size={14} />
                    <span className="text-xs font-mono tracking-wide">guest@dhruv-portfolio: ~</span>
                </div>
                <div className="w-12"></div> {/* Spacer for centering */}
            </div>

            {/* Body */}
            <div
                className="p-6 h-[400px] overflow-y-auto text-gray-100 font-mono scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
                onClick={() => inputRef.current?.focus()}
            >
                {history.map((item, i) => (
                    <div key={i} className="mb-3">
                        <div className="flex gap-2">
                            <span className="text-green-500">➜</span>
                            <span className="text-blue-400">~</span>
                            <span className="text-white">{item.command}</span>
                        </div>
                        {item.output && <div className="ml-6 mt-1 text-gray-300 tracking-wide leading-relaxed">{item.output}</div>}
                    </div>
                ))}

                <form onSubmit={handleCommand} className="flex gap-2 items-center">
                    <span className="text-green-500">➜</span>
                    <span className="text-blue-400">~</span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDownReal}
                        className="bg-transparent border-none outline-none text-white flex-1 caret-white"
                        autoFocus
                        autoComplete="off"
                    />
                </form>
                <div ref={bottomRef} />
            </div>
        </motion.div>
    );
}
