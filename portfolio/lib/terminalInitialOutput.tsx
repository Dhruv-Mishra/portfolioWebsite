import type { CSSProperties, ReactNode } from "react";
import TerminalPrompt from "@/components/TerminalPrompt";
import { APP_VERSION, TERMINAL_HOST, TERMINAL_USER } from "@/lib/constants";
import { PAPER_PALETTE, TERMINAL_COLORS } from "@/lib/designTokens";

// A spiral sketchbook with a D on the cover. Pure ASCII: the Fira Code subset has no box or block glyphs.
const WIDE_ART = String.raw`
  o o o o o o o o
.-|-|-|-|-|-|-|-|-.
|                 |
|   ._______      |
|   | .___  '.    |
|   | |   \   \   |
|   | |___/   /   |
|   |_______.'    |
|                 |
'-----------------'`.replace(/\r/g, '').slice(1);

const COMPACT_ART = String.raw`
 o o o o o o
.|-|-|-|-|-|.
|  .____.   |
|  | ._  \  |
|  | |_) |  |
|  |____./  |
|           |
'-----------'`.replace(/\r/g, '').slice(1);

interface Fact {
    label: string;
    value: string;
    /** Shorter value for narrow terminals; `null` hides the row there. */
    compact?: string | null;
}

const FACTS: readonly Fact[] = [
    { label: 'OS', value: `Sketchbook ${APP_VERSION}` },
    { label: 'Host', value: 'whoisdhruv.com', compact: null },
    { label: 'Work', value: 'Software engineer, Microsoft', compact: 'SWE at Microsoft' },
    { label: 'Builds', value: 'AI agents, Azure backends', compact: 'AI agents' },
    { label: 'Langs', value: 'C#, TypeScript, Python, C++', compact: 'C#, TS, Py, C++' },
    { label: 'Rank', value: 'Codeforces Expert' },
];

const SWATCHES = [PAPER_PALETTE.pink, PAPER_PALETTE.coral, PAPER_PALETTE.amber, PAPER_PALETTE.yellow, PAPER_PALETTE.green, PAPER_PALETTE.blue, PAPER_PALETTE.lavender, PAPER_PALETTE.rose];
const SWATCH_STYLES: readonly CSSProperties[] = SWATCHES.map((backgroundColor) => ({ backgroundColor }));
const ART_CLASS = `select-none leading-[inherit] [font-variant-ligatures:none] ${TERMINAL_COLORS.art} bg-clip-text text-transparent`;

function Neofetch() {
    return (
        <div className="@container">
            {/* --neofetch-cols = art + gap + longest fact in monospace columns (0.6em each); below that width the block shrinks instead of wrapping. */}
            <div className="flex items-start gap-x-[2ch] font-code leading-[1.25] tracking-normal [--neofetch-cols:38] text-[length:min(0.875rem,calc(100cqi/(var(--neofetch-cols)*0.6+2)))] @md:gap-x-[3ch] @md:[--neofetch-cols:56]">
                <pre aria-hidden="true" className={`${ART_CLASS} @md:hidden`}>{COMPACT_ART}</pre>
                <pre aria-hidden="true" className={`${ART_CLASS} hidden @md:block`}>{WIDE_ART}</pre>
                <div className="min-w-0">
                    <p className={TERMINAL_COLORS.prompt}>
                        {TERMINAL_USER}<span className={TERMINAL_COLORS.punctuation}>@</span>{TERMINAL_HOST}
                    </p>
                    <p aria-hidden="true" className={TERMINAL_COLORS.punctuation}>{'-'.repeat(TERMINAL_USER.length + TERMINAL_HOST.length + 1)}</p>
                    <dl className={TERMINAL_COLORS.output}>
                        {FACTS.map(({ label, value, compact }) => (
                            <div key={label} className={compact === null ? 'hidden @md:block' : undefined}>
                                <dt className={`inline ${TERMINAL_COLORS.prompt}`}>{label}:</dt>{' '}
                                <dd className="inline">
                                    {compact ? (
                                        <>
                                            <span className="@md:hidden">{compact}</span>
                                            <span className="hidden @md:inline">{value}</span>
                                        </>
                                    ) : value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                    <div aria-hidden="true" className="flex h-[1.25em] items-center @md:mt-[1.25em]">
                        {SWATCH_STYLES.map((style, index) => (
                            <span key={index} className="h-[0.9em] w-[1.5em]" style={style} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function createNeofetchOutput(): ReactNode {
    return <Neofetch />;
}

export function createInitialTerminalOutput(): ReactNode {
    return (
        <div>
            <p className="flex gap-x-[1ch] opacity-90">
                <TerminalPrompt />
                <span className={TERMINAL_COLORS.command}>neofetch</span>
            </p>
            <div className="mt-2">
                <Neofetch />
            </div>
        </div>
    );
}
