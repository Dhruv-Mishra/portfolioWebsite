import React from "react";
import { APP_VERSION } from "@/lib/constants";

// figlet "slant" / "smslant". Pure ASCII so every glyph comes from one monospace face (the Fira Code subset has no box glyphs).
const WIDE_BANNER = String.raw`           __          _          ____
 _      __/ /_  ____  (_)________/ / /_  _______  ___   __
| | /| / / __ \/ __ \/ / ___/ __  / __ \/ ___/ / / / | / /
| |/ |/ / / / / /_/ / (__  ) /_/ / / / / /  / /_/ /| |/ /
|__/|__/_/ /_/\____/_/____/\__,_/_/ /_/_/   \__,_/ |___/`;

const COMPACT_BANNER = String.raw`     ____
 ___/ / /  ______ ___  __
/ _  / _ \/ __/ // / |/ /
\_,_/_//_/_/  \_,_/|___/`;

const columns = (art: string) => Math.max(...art.split('\n').map((line) => line.length));

// Shrink below the body font size whenever the terminal is too narrow, so the art never clips (Fira advance = 0.6em).
const bannerStyle = (art: string) => ({ fontSize: `min(1em, calc(100cqi / ${columns(art) * 0.6 + 1}))` }) as const;
const WIDE_STYLE = bannerStyle(WIDE_BANNER);
const COMPACT_STYLE = bannerStyle(COMPACT_BANNER);
const BANNER_CLASS = "select-none overflow-hidden leading-[1.15] text-emerald-300 [text-shadow:0_0_6px_rgb(52_211_153/0.22)]";

export function createInitialTerminalOutput(): React.ReactNode {
    return (
        <div className="text-gray-300">
            <pre aria-hidden="true" className={`${BANNER_CLASS} hidden @sm:block`} style={WIDE_STYLE}>{WIDE_BANNER}</pre>
            <pre aria-hidden="true" className={`${BANNER_CLASS} @sm:hidden`} style={COMPACT_STYLE}>{COMPACT_BANNER}</pre>
            <span className="sr-only">whoisdhruv terminal.</span>
            <p className="mt-3">
                <span className="hidden @sm:inline">{APP_VERSION} ready. </span>
                Type <span className="text-emerald-400">help</span> to look around.
            </p>
        </div>
    );
}
