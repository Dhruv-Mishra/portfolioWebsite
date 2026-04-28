import React from "react";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { rateLimiter, RATE_LIMITS } from "@/lib/rateLimit";
import { APP_VERSION } from "@/lib/constants";
import { TIMING_TOKENS } from '@/lib/designTokens';
import { EXTERNAL_API_TIMEOUT_MS } from '@/lib/llmConfig';
import { PERSONAL_LINKS } from '@/lib/links';
import CheatsheetOutput from '@/components/CheatsheetOutput';
import {
    isSuperuserEarnedSync,
    getMatrixEscapedSync,
    getDiscoActiveSync,
} from '@/hooks/useStickers';
import {
    parseSudoInvocation,
    dispatchSudo,
    SUDO_DENIED_NODE,
} from '@/lib/sudoCommands';
import { stickerBus } from '@/lib/stickerBus';
import { STICKER_ROSTER } from '@/lib/stickers';
import {
    getCurrentStage,
    getHintForStage,
    MATRIX_PUZZLE_KEYS,
    readSessionFlag,
    type MatrixPuzzleSignals,
} from '@/lib/matrixPuzzle';
import { getExperimentalCommandsSync } from '@/hooks/useAdminPrefs';
import { hasClientAdminTokenSync } from '@/lib/adminAuthClient';

/** Delay (ms) before executing page navigation from terminal commands */
const NAVIGATION_DELAY_MS = TIMING_TOKENS.navigationDelay;

export interface CommandResult {
    output: React.ReactNode;
    action?: () => void;
}

export type CommandHandler = (args: string[]) => CommandResult | Promise<CommandResult>;

export function createInitialTerminalOutput(): React.ReactNode {
    return (
        <div className="text-gray-400 text-sm font-mono leading-relaxed">
            <p>
                <span className="text-emerald-400">[✓]</span>{' '}
                <span className="text-white">Portfolio {APP_VERSION} ready.</span>{' '}
                <span className="text-gray-500">Type</span>{' '}
                <span className="text-emerald-400 font-bold">&apos;help&apos;</span>{' '}
                <span className="text-gray-500">to explore.</span>
            </p>
        </div>
    );
}

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
                <p className="pl-4 text-emerald-400">chat       - Talk to AI-me</p>
                <p className="pl-4 text-emerald-400">feedback   - Report a bug / send feedback</p>
                <p className="pl-4 text-emerald-400">guestbook  - Sign the wall</p>
                <p className="pl-4 text-emerald-400">sign       - Alias for guestbook</p>
                <p className="pl-4 text-emerald-400">stickers   - Open the sticker drawer</p>
                <p className="pl-4 text-emerald-400">cheatsheet - Browse all stickers</p>
                <p className="pl-4 text-emerald-400">matrix hint - Nudge for the current puzzle stage <span className="text-gray-500">(alias: /hint)</span></p>
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
            const timeoutId = setTimeout(() => controller.abort(), EXTERNAL_API_TIMEOUT_MS);

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
                <p>I&apos;m a <strong className="text-emerald-400">Software Engineer at Microsoft</strong> on the M365 Shell Team — our service handles identity and user data at 7B+ hits/day. I work with C++ and C# on enterprise encryption flows, cutting infrastructure costs and driving AI workflow adoption.</p>
                <p>I come from a strong CS background, enjoy competitive programming, and love optimizing things — from code to PC hardware.</p>
            </div>
        )
    }),
    contact: () => ({
        output: (
            <div className="space-y-1">
                <p>Ways to reach me:</p>
                <p className="pl-4">
                    <span className="text-gray-400 w-16 inline-block">Email:</span>
                    <a href={PERSONAL_LINKS.email} className="text-blue-400 hover:underline">dhruvmishra.id@gmail.com</a>
                </p>
                <p className="pl-4">
                    <span className="text-gray-400 w-16 inline-block">GitHub:</span>
                    <a href={PERSONAL_LINKS.github} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">@Dhruv-Mishra</a>
                </p>
                <p className="pl-4">
                    <span className="text-gray-400 w-16 inline-block">Phone:</span>
                    <a href={PERSONAL_LINKS.phone} className="text-blue-400 hover:underline">(+91) 9599377944</a>
                </p>
            </div>
        )
    }),
    projects: () => ({
        output: "Navigating to projects...",
        action: () => { setTimeout(() => router.push("/projects"), NAVIGATION_DELAY_MS); }
    }),
    guestbook: () => ({
        output: "Navigating to the wall...",
        action: () => { setTimeout(() => router.push("/guestbook"), NAVIGATION_DELAY_MS); }
    }),
    sign: () => ({
        output: "Navigating to the wall...",
        action: () => { setTimeout(() => router.push("/guestbook"), NAVIGATION_DELAY_MS); }
    }),
    stickers: () => ({
        output: "Opening sticker drawer...",
        action: () => { setTimeout(() => router.push("/stickers"), NAVIGATION_DELAY_MS); }
    }),
    init: () => {
        const uptime = typeof window !== 'undefined' ? Math.floor(performance.now() / 1000) : 0;
        return {
            output: (
                <span className="text-yellow-400">
                    System already initialized. ({APP_VERSION}) <br />
                    &gt; Uptime: <span className="text-gray-400">{uptime}s</span> <br />
                    &gt; Status: <span className="text-green-400">Stable</span>
                </span>
            )
        };
    },
    resume: () => ({
        output: "Navigating to resume page...",
        action: () => { setTimeout(() => router.push("/resume"), NAVIGATION_DELAY_MS); }
    }),
    cv: () => ({
        output: "Navigating to resume page...",
        action: () => { setTimeout(() => router.push("/resume"), NAVIGATION_DELAY_MS); }
    }),
    chat: () => ({
        output: "Navigating to chat...",
        action: () => { setTimeout(() => router.push("/chat"), NAVIGATION_DELAY_MS); }
    }),
    socials: () => ({
        output: (
            <div className="space-y-1">
                <p>Connect with me:</p>
                <p className="pl-4"><span className="text-gray-400">GitHub:</span> <a href={PERSONAL_LINKS.github} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">@Dhruv-Mishra</a></p>
                <p className="pl-4"><span className="text-gray-400">LinkedIn:</span> <a href={PERSONAL_LINKS.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">@dhruv-mishra-id</a></p>
                <p className="pl-4"><span className="text-gray-400">Codeforces:</span> <a href={PERSONAL_LINKS.codeforces} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">@DhruvMishra</a></p>
            </div>
        )
    }),
    github: () => ({
        output: "Opening GitHub profile...",
        action: () => {
            window.open(PERSONAL_LINKS.github, '_blank', 'noopener,noreferrer');
            // Terminal-originated opens go to GitHub or elsewhere — count as
            // social-butterfly since a link was actually followed.
            stickerBus.emit('social-butterfly');
        },
    }),
    linkedin: () => ({
        output: "Opening LinkedIn profile...",
        action: () => {
            window.open(PERSONAL_LINKS.linkedin, '_blank', 'noopener,noreferrer');
            stickerBus.emit('social-butterfly');
        },
    }),
    skills: () => ({
        output: (
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <p className="text-emerald-400 font-bold border-b border-gray-600 mb-2 uppercase tracking-wider text-xs">Core Tech</p>
                        <div className="pl-1 space-y-1 text-gray-300">
                            <p>• <span className="text-white font-semibold">Languages:</span> C++, C#, Python, TypeScript, Java, Kotlin</p>
                            <p>• <span className="text-white font-semibold">Frontend:</span> Next.js, React, Tailwind, Framer Motion</p>
                            <p>• <span className="text-white font-semibold">Backend:</span> Node.js, MySQL, Azure, CI/CD</p>
                            <p>• <span className="text-white font-semibold">Mobile:</span> Android SDK, Jetpack Compose, DI (Hilt)</p>
                        </div>
                    </div>
                    <div>
                        <p className="text-blue-400 font-bold border-b border-gray-600 mb-2 uppercase tracking-wider text-xs">Competencies</p>
                        <div className="pl-1 space-y-1 text-gray-300">
                            <p>• System Design & Scalability</p>
                            <p>• High-Performance Computing</p>
                            <p>• Distributed Systems</p>
                            <p>• OOP & Clean Architecture</p>
                            <p>• Algorithms (Codeforces Expert)</p>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800/30 p-2 rounded border border-gray-700/50">
                    <p className="text-amber-400 font-bold mb-1 text-xs uppercase tracking-wider">Rankings & Achievements</p>
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-400">
                        <span>🏆 Codeforces Expert (Max 1703)</span>
                        <span>⭐ Microsoft FHL Winner</span>
                        <span>🥇 Google Farewell Round (Global Rank 291)</span>
                        <span>🎓 IIITD CSAM Honors (8.96 GPA)</span>
                    </div>
                </div>

                <p className="text-gray-500 italic text-xs">Type &apos;projects&apos; to see the code backing these up.</p>
            </div>
        )
    }),
    ls: () => {
        // adminTerminal.txt only appears in the listing once the user has
        // sudo; otherwise it's a hidden/root-only file.
        const hasSudo = isSuperuserEarnedSync();
        return {
            output: (
                <div className="grid grid-cols-2 gap-2 max-w-xs text-blue-300">
                    <span>about.md</span>
                    <span>projects.json</span>
                    <span>jarvis.md</span>
                    <span>cropio.md</span>
                    <span>resume.pdf</span>
                    <span>contact.txt</span>
                    <span>secrets.env</span>
                    {hasSudo ? (
                        <span
                            className="text-amber-300 font-bold"
                            title="Read with `sudo cat adminTerminal.txt`"
                        >
                            adminTerminal.txt
                        </span>
                    ) : null}
                </div>
            ),
        };
    },
    cat: (args: string[]) => {
        const file = args[0];
        if (!file) return { output: "Usage: cat [filename]" };
        // Special-case the privileged file — bare `cat` is always denied;
        // the user must go through `sudo cat`. Matches Linux-style copy.
        if (file.toLowerCase() === 'adminterminal.txt') {
            return {
                output: (
                    <div>
                        <span className="text-red-400 font-bold">cat: adminTerminal.txt: Permission denied.</span>{' '}
                        <span className="text-gray-400">(insufficient privileges)</span>
                    </div>
                ),
            };
        }
        const files: Record<string, string> = {
            "about.md": "Dhruv Mishra: Algorithmic thinker, Developer, and Problem Solver.",
            "projects.json": "[ { \"name\": \"Jarvis Voice Agent\", \"stack\": \"Gemini Live + Node.js + WebSockets\" }, { \"name\": \"Portfolio\", \"stack\": \"Next.js\" }, { \"name\": \"Cropio\", \"stack\": \"Next.js + FastAPI + YOLO11 Pose\" }, ... ]",
            "jarvis.md": "Jarvis: voice-to-voice AI agent that holds full human-sounding phone calls and operates the website via Gemini Live tool calling \u2014 navigation, form filling, quote generation, negotiation. Live demo at jarvis.whoisdhruv.com.",
            "cropio.md": "Cropio: privacy-conscious AI portrait cropper. Uses YOLO11 pose estimation, an interactive crop editor, full-resolution browser export, and semantic search over local IndexedDB embeddings.",
            "contact.txt": "Email: dhruvmishra.id@gmail.com\nPhone: (+91) 9599377944",
            "resume.pdf": "Error: Binary file not readable. Try 'open resume.pdf'",
            "secrets.env": "Error: Permission denied. Nice try! ;)"
        };
        return { output: files[file] || `File not found: ${file}` };
    },
    open: (args: string[]) => {
        const file = args[0];
        if (!file) return { output: "Usage: open [filename]" };
        const openable: Record<string, { output: string; route: string }> = {
            "resume.pdf": { output: "Opening resume...", route: "/resume" },
            "projects.json": { output: "Opening projects...", route: "/projects" },
            "jarvis.md": { output: "Opening projects...", route: "/projects" },
            "cropio.md": { output: "Opening projects...", route: "/projects" },
        };
        const entry = openable[file];
        if (entry) return { output: entry.output, action: () => { setTimeout(() => router.push(entry.route), NAVIGATION_DELAY_MS); } };
        return { output: `Cannot open ${file}. Try 'cat' to read it.` };
    },
    whoami: () => ({ output: "visitor@dhruvs.portfolio" }),
    date: () => ({ output: new Date().toString() }),
    // Cheatsheet is privileged. The bare command only reveals that privileges
    // are required — the user has to figure out how to escalate on their own.
    // We still award the `cheat-codes` sticker for *trying* the command so it
    // remains reachable before Superuser (which gates the full sudo path).
    cheatsheet: () => ({
        output: (
            <div>
                <span className="text-red-400 font-bold">cheatsheet:</span>{' '}
                <span className="text-red-400">insufficient privileges.</span>{' '}
                <span className="text-gray-500">hint: try with escalated permissions.</span>
            </div>
        ),
        action: () => { stickerBus.emit('cheat-codes'); },
    }),
    sudo: (args: string[]) => {
        const invocation = parseSudoInvocation(args);
        // Gate: before Superuser has been earned, every sudo is denied.
        if (!isSuperuserEarnedSync()) {
            return { output: SUDO_DENIED_NODE };
        }
        return dispatchSudo(invocation, {
            router,
            renderCheatsheet: () => <CheatsheetOutput />,
        });
    },
    feedback: () => ({
        output: (
            <span className="text-emerald-300">Opening feedback form... ✏️</span>
        ),
        action: () => {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('open-feedback'));
            }
        }
    }),
    // Hidden debug command — not listed in `help`. Emits every regular sticker
    // so the auto-award path for Superuser can be exercised without grinding
    // the roster by hand. Intentionally omits the `superuser` id; the store
    // awards that atomically once all regulars are unlocked.
    unlockstickers: () => ({
        output: (
            <div className="space-y-1 font-mono text-sm">
                <p>
                    <span className="text-yellow-400">[debug]</span>{' '}
                    <span className="text-gray-200">
                        Unlocking all {STICKER_ROSTER.length} regular stickers. Superuser should auto-award.
                    </span>
                </p>
                <p className="text-gray-500">Open /stickers to see the full roster.</p>
            </div>
        ),
        action: () => {
            for (const sticker of STICKER_ROSTER) {
                stickerBus.emit(sticker.id);
            }
        },
    }),
    /**
     * `matrix` — dispatch subcommands. Currently only `hint` is implemented
     * but this keeps room for future growth (e.g. `matrix status`).
     */
    matrix: (args: string[]) => {
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'hint') return renderMatrixHintResult();
        return {
            output: (
                <div>
                    <p className="text-gray-300">Usage: <span className="text-emerald-400 font-bold">matrix hint</span></p>
                    <p className="text-gray-500 italic text-xs">
                        returns an indirect nudge based on where you are in the puzzle.
                    </p>
                </div>
            ),
        };
    },
    /** Alias: `/hint` — same behavior as `matrix hint`. */
    '/hint': () => renderMatrixHintResult(),
    hint: () => renderMatrixHintResult(),
    clear: () => ({ output: "" })
});

/**
 * Compose the current puzzle-stage signals and return a hint line. Pure
 * read — no state mutations. Called by both `matrix hint` and `/hint`.
 */
function renderMatrixHintResult(): CommandResult {
    const signals: MatrixPuzzleSignals = {
        hasSuperuser: isSuperuserEarnedSync(),
        sawAdminTerminalFile: readSessionFlag(MATRIX_PUZZLE_KEYS.sawAdminTerminalFile),
        hasFileContents: readSessionFlag(MATRIX_PUZZLE_KEYS.hasFileContents),
        adminAuthUnlocked: hasClientAdminTokenSync(),
        experimentalCommandsEnabled: getExperimentalCommandsSync(),
        ranSudoMatrix: readSessionFlag(MATRIX_PUZZLE_KEYS.ranSudoMatrix),
        clickedDisabledEscape: readSessionFlag(MATRIX_PUZZLE_KEYS.clickedDisabledEscape),
        discoActive: getDiscoActiveSync(),
        matrixEscaped: getMatrixEscapedSync(),
    };
    const stage = getCurrentStage(signals);
    const hint = getHintForStage(stage);
    return {
        output: (
            <div
                role="status"
                aria-live="polite"
                className="border-l-2 border-cyan-400/60 pl-3 py-1 my-1"
            >
                <p className="text-cyan-300 font-bold text-xs uppercase tracking-widest">oracle hint</p>
                <p className="text-gray-200 mt-1 italic">{hint}</p>
            </div>
        ),
    };
}
