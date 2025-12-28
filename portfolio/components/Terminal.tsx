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
            initial={{ scale: 0.95, opacity: 0, rotate: 1 }}
            animate={{ scale: 1, opacity: 1, rotate: -1 }}
            transition={{ duration: 0.5, type: "spring", bounce: 0.4 }}
            className="w-full max-w-3xl mx-auto relative group perspective-[1000px]"
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
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />

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
                        <span>Sketchinator v1.0</span>
                    </div>
                    <div className="w-16"></div>
                </div>

                {/* Body - Chalkboard Vibe */}
                <div
                    className="p-6 h-[400px] overflow-y-auto font-code text-sm md:text-base scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent selection:bg-gray-600 selection:text-white"
                    onClick={() => inputRef.current?.focus()}
                >
                    {history.map((item, i) => (
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
                            placeholder="Type a command..."
                        />
                    </form>
                    <div ref={bottomRef} />
                </div>
            </div>
        </motion.div>
    );
}
