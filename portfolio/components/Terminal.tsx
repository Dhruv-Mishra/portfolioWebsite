"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Terminal as TerminalIcon } from "lucide-react";
import { useTerminal } from "@/context/TerminalContext";
import { rateLimiter, RATE_LIMITS } from "@/lib/rateLimit";
import { trackTerminalCommand } from "@/lib/analytics";

import { useRouter } from "next/navigation";
import { HEADER_NOISE_SVG } from "@/lib/assets";

export default function Terminal() {
    const { outputLines, commandHistory, addCommand, addToHistory, clearOutput } = useTerminal();
    const router = useRouter(); // Correctly using hook inside component

    const [input, setInput] = useState("");
    const [historyIndex, setHistoryIndex] = useState(-1);

    const inputRef = useRef<HTMLInputElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const isInitialMount = useRef(true);

    // Command Registry defined inside to access router
    const COMMAND_REGISTRY: Record<string, (args: string[]) => { output: React.ReactNode; action?: () => void } | Promise<{ output: React.ReactNode; action?: () => void }>> = React.useMemo(() => ({
        help: () => ({
            output: (
                <div className="space-y-1">
                    <p>Available commands:</p>
                    <p className="pl-4 text-emerald-400">about      - Who is Dhruv?</p>
                    <p className="pl-4 text-emerald-400">projects   - View my work</p>
                    <p className="pl-4 text-emerald-400">contact    - Get in touch</p>
                    <p className="pl-4 text-emerald-400">socials    - List social links</p>
                    <p className="pl-4 text-emerald-400">ls         - List files</p>
                    <p className="pl-4 text-emerald-400">cat <span className="text-gray-500">[file]</span> - Read file</p>
                    <p className="pl-4 text-emerald-400">open <span className="text-gray-500">[file]</span> - Open file</p>
                    <p className="pl-4 text-emerald-400">clear      - Clear terminal</p>
                    <p className="pl-4 text-emerald-400">joke       - Tell a joke</p>
                    <p className="pl-4 text-emerald-400">resume     - View Resume</p>
                </div>
            )
        }),
        joke: async () => {
            // Rate limit check
            if (!rateLimiter.check('joke-api', RATE_LIMITS.JOKE_API)) {
                const remainingTime = rateLimiter.getRemainingTime('joke-api', RATE_LIMITS.JOKE_API);
                return { 
                    output: (
                        <span className="text-yellow-400">
                            ⏳ Whoa there! Too many jokes. Try again in {remainingTime} seconds.
                        </span>
                    )
                };
            }

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
                
                const res = await fetch('https://v2.jokeapi.dev/joke/Programming?safe-mode', {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!res.ok) {
                    throw new Error('API request failed');
                }

                const data = await res.json();

                if (data.error) {
                    return { output: <span className="text-red-400">Error: Humor module offline.</span> };
                }

                return {
                    output: (
                        <div className="text-emerald-300 border-l-2 border-emerald-500/30 pl-3 py-1 my-1">
                            {data.type === 'single' ? (
                                <p className="italic">&quot;{data.joke}&quot;</p>
                            ) : (
                                <div className="space-y-2">
                                    <p>{data.setup}</p>
                                    <p className="text-emerald-200 font-bold">&gt; {data.delivery}</p>
                                </div>
                            )}
                        </div>
                    )
                };
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    return { output: <span className="text-red-400">Error: Request timed out.</span> };
                }
                return { output: <span className="text-red-400">Error: Connection failed.</span> };
            }
        },
        about: () => ({
            output: (
                <div className="space-y-2">
                    <p>Hey, I&apos;m <strong className="text-emerald-400">Dhruv</strong> 👋</p>
                    <p>I build and optimize software systems that need to be fast, reliable, and boring in production.</p>
                    <p>I&apos;m a <strong className="text-emerald-400">Software Engineer at Microsoft</strong>, working across Android and backend platforms used by millions—profiling cold starts, tuning UI pipelines, fixing scaling bottlenecks, and shaving real milliseconds (and dollars) off large systems. I enjoy deep dives into performance, distributed systems, and infrastructure that quietly does its job well.</p>
                    <p>I come from a strong CS background, spend time with competitive programming, and like turning complex technical problems into clean, production-ready solutions.</p>
                </div>
            )
        }),
        contact: () => ({
            output: (
                <div className="space-y-1">
                    <p>Ways to reach me:</p>
                    <p className="pl-4">
                        <span className="text-gray-400 w-16 inline-block">Email:</span>
                        <a href="mailto:dhruvmishra.id@gmail.com" className="text-blue-400 hover:underline">dhruvmishra.id@gmail.com</a>
                    </p>
                    <p className="pl-4">
                        <span className="text-gray-400 w-16 inline-block">GitHub:</span>
                        <a href="https://github.com/Dhruv-Mishra" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">@Dhruv-Mishra</a>
                    </p>
                    <p className="pl-4">
                        <span className="text-gray-400 w-16 inline-block">Phone:</span>
                        <a href="tel:+919599377944" className="text-blue-400 hover:underline">(+91) 9599377944</a>
                    </p>
                </div>
            )
        }),
        projects: () => ({
            output: "Navigating to projects...",
            action: () => router.push("/projects")
        }),
        init: () => ({
            output: (
                <span className="text-yellow-400">
                    System already initialized. <br />
                    &gt; Uptime: <span className="text-gray-400">{Math.floor(performance.now() / 1000)}s</span> <br />
                    &gt; Status: <span className="text-green-400">Stable</span>
                </span>
            )
        }),
        resume: () => ({
            output: "Navigating to resume page...",
            action: () => router.push("/resume")
        }),
        cv: () => ({
            output: "Navigating to resume page...",
            action: () => router.push("/resume")
        }),

        // Social Commands
        socials: () => ({
            output: (
                <div className="space-y-1">
                    <p>Connect with me:</p>
                    <p className="pl-4"><span className="text-gray-400">GitHub:</span> <span className="text-blue-400 hover:underline cursor-pointer" onClick={() => window.open('https://github.com/Dhruv-Mishra', '_blank')}>@Dhruv-Mishra</span></p>
                    <p className="pl-4"><span className="text-gray-400">LinkedIn:</span> <span className="text-blue-400 hover:underline cursor-pointer" onClick={() => window.open('https://www.linkedin.com/in/dhruv-mishra-id/', '_blank')}>@dhruv-mishra-id</span></p>
                    <p className="pl-4"><span className="text-gray-400">Codeforces:</span> <span className="text-blue-400 hover:underline cursor-pointer" onClick={() => window.open('https://codeforces.com/profile/DhruvMishra', '_blank')}>@DhruvMishra</span></p>
                    <p className="pl-4"><span className="text-gray-400">CP History:</span> <span className="text-blue-400 hover:underline cursor-pointer" onClick={() => window.open('https://zibada.guru/gcj/profile/Dhruv985', '_blank')}>@Dhruv985</span></p>
                    <p className="pl-4"><span className="text-gray-400">Email:</span> <span className="text-blue-400 hover:underline cursor-pointer" onClick={() => window.open('mailto:dhruvmishra.id@gmail.com', '_blank')}>dhruvmishra.id@gmail.com</span></p>
                </div>
            )
        }),
        github: () => ({
            output: "Opening GitHub profile...",
            action: () => window.open('https://github.com/Dhruv-Mishra', '_blank')
        }),
        linkedin: () => ({
            output: "Opening LinkedIn profile...",
            action: () => window.open('https://www.linkedin.com/in/dhruv-mishra-id/', '_blank')
        }),
        codeforces: () => ({
            output: "Opening Codeforces profile...",
            action: () => window.open('https://codeforces.com/profile/DhruvMishra', '_blank')
        }),
        email: () => ({
            output: "Opening mail client...",
            action: () => window.location.href = "mailto:dhruvmishra.id@gmail.com"
        }),

        // Easter Eggs & Utility
        ls: () => ({
            output: (
                <div className="grid grid-cols-2 gap-2 max-w-xs text-blue-300">
                    <span>about.md</span>
                    <span>projects.json</span>
                    <span>resume.pdf</span>
                    <span>contact.txt</span>
                    <span>secrets.env</span>
                </div>
            )
        }),
        cat: (args: string[]) => {
            const file = args[0];
            if (!file) return { output: "Usage: cat [filename]" };

            const files: Record<string, string> = {
                "about.md": "Dhruv Mishra: Algorithmic thinker, Developer, and Problem Solver.",
                "projects.json": "[ { \"name\": \"Portfolio\", \"stack\": \"Next.js\" }, ... ]",
                "contact.txt": "Email: dhruvmishra.id@gmail.com\nPhone: (+91) 9599377944",
                "resume.pdf": "Error: Binary file not readable. Try 'open resume.pdf'",
                "secrets.env": "Error: Permission denied. Nice try! ;)"
            };

            return { output: files[file] || `File not found: ${file}` };
        },
        open: (args: string[]) => {
            const file = args[0];
            if (!file) return { output: "Usage: open [filename]" };

            if (file === "resume.pdf") {
                return {
                    output: "Opening resume...",
                    action: () => router.push("/resume")
                };
            }
            if (file === "projects.json") {
                return {
                    output: "Opening projects...",
                    action: () => router.push("/projects")
                };
            }
            return { output: `Cannot open ${file}. Try 'cat' to read it.` };
        },
        whoami: () => ({
            output: "visitor@dhruvs.portfolio"
        }),
        date: () => ({
            output: new Date().toString()
        }),
        sudo: () => ({
            output: <span className="text-red-500 font-bold">Permission denied: You are not authorized to perform this action.</span>
        }),

        // 'clear' is handled specially
        clear: () => ({ output: "" })
    }), [router]);

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
