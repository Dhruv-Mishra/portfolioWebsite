import React from "react";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { rateLimiter, RATE_LIMITS } from "@/lib/rateLimit";

export interface CommandResult {
    output: React.ReactNode;
    action?: () => void;
}

export type CommandHandler = (args: string[]) => CommandResult | Promise<CommandResult>;

export const createCommandRegistry = (router: AppRouterInstance): Record<string, CommandHandler> => ({
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
                <p className="pl-4 text-emerald-400">skills     - View Tech Stack</p>
                <p className="pl-4 text-emerald-400">resume     - View Resume</p>
            </div>
        )
    }),
    joke: async () => {
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
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch('https://v2.jokeapi.dev/joke/Programming?safe-mode', {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error('API request failed');
            const data = await res.json();
            if (data.error) return { output: <span className="text-red-400">Error: Humor module offline.</span> };

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
        } catch {
            return { output: <span className="text-red-400">Error: Connection failed.</span> };
        }
    },
    about: () => ({
        output: (
            <div className="space-y-2">
                <p>Hey, I&apos;m <strong className="text-emerald-400">Dhruv</strong> 👋</p>
                <p>I build and optimize software systems that need to be fast, reliable, and boring in production.</p>
                <p>I&apos;m a <strong className="text-emerald-400">Software Engineer at Microsoft</strong>, working across Android and backend platforms used by millions—profiling cold starts, tuning UI pipelines, fixing scaling bottlenecks, and shaving real milliseconds off large systems.</p>
                <p>I come from a strong CS background and spend time with competitive programming.</p>
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
    init: () => {
        const uptime = typeof window !== 'undefined' ? Math.floor(performance.now() / 1000) : 0;
        return {
            output: (
                <span className="text-yellow-400">
                    System already initialized. <br />
                    &gt; Uptime: <span className="text-gray-400">{uptime}s</span> <br />
                    &gt; Status: <span className="text-green-400">Stable</span>
                </span>
            )
        };
    },
    resume: () => ({
        output: "Navigating to resume page...",
        action: () => router.push("/resume")
    }),
    cv: () => ({
        output: "Navigating to resume page...",
        action: () => router.push("/resume")
    }),
    socials: () => ({
        output: (
            <div className="space-y-1">
                <p>Connect with me:</p>
                <p className="pl-4"><span className="text-gray-400">GitHub:</span> <a href="https://github.com/Dhruv-Mishra" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">@Dhruv-Mishra</a></p>
                <p className="pl-4"><span className="text-gray-400">LinkedIn:</span> <a href="https://www.linkedin.com/in/dhruv-mishra-id/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">@dhruv-mishra-id</a></p>
                <p className="pl-4"><span className="text-gray-400">Codeforces:</span> <a href="https://codeforces.com/profile/DhruvMishra" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">@DhruvMishra</a></p>
            </div>
        )
    }),
    github: () => ({
        output: "Opening GitHub profile...",
        action: () => window.open('https://github.com/Dhruv-Mishra', '_blank', 'noopener,noreferrer')
    }),
    linkedin: () => ({
        output: "Opening LinkedIn profile...",
        action: () => window.open('https://www.linkedin.com/in/dhruv-mishra-id/', '_blank', 'noopener,noreferrer')
    }),
    skills: () => ({
        output: (
            <div className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <p className="text-emerald-400 font-bold border-b border-gray-600 mb-1">Languages</p>
                        <div className="pl-2 space-y-0.5 text-gray-300">
                            <p>• Python <span className="text-gray-500 text-xs">(Advanced)</span></p>
                            <p>• Kotlin / Java <span className="text-gray-500 text-xs">(Android Expert)</span></p>
                            <p>• TypeScript / JS <span className="text-gray-500 text-xs">(Full Stack)</span></p>
                            <p>• C++ <span className="text-gray-500 text-xs">(Competitive)</span></p>
                        </div>
                    </div>
                    <div>
                        <p className="text-blue-400 font-bold border-b border-gray-600 mb-1">Frameworks & Tools</p>
                        <div className="pl-2 space-y-0.5 text-gray-300">
                            <p>• Next.js / React</p>
                            <p>• Android SDK / Jetpack</p>
                            <p>• Git / GitHub Actions</p>
                            <p>• Linux / Bash</p>
                        </div>
                    </div>
                </div>
                <p className="text-gray-500 italic text-xs mt-2">Type &apos;projects&apos; to see them in action.</p>
            </div>
        )
    }),
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
        if (file === "resume.pdf") return { output: "Opening resume...", action: () => router.push("/resume") };
        if (file === "projects.json") return { output: "Opening projects...", action: () => router.push("/projects") };
        return { output: `Cannot open ${file}. Try 'cat' to read it.` };
    },
    whoami: () => ({ output: "visitor@dhruvs.portfolio" }),
    date: () => ({ output: new Date().toString() }),
    sudo: () => ({ output: <span className="text-red-500 font-bold">Permission denied: You are not authorized.</span> }),
    clear: () => ({ output: "" })
});
