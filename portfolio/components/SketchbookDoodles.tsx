import React, { type CSSProperties, type ReactNode } from 'react';
import { CHALK_COLORS as CHALK_INK } from '@/lib/designTokens';

/** Line-doodle stroke shared by the hand-drawn sprites; the width follows the theme (thin ink, thick chalk). */
const LINE = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    style: { strokeWidth: 'var(--d-stroke-width)' },
} as const;

const CHALK = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const CHALK_TEXT = { fill: 'currentColor', style: { fontFamily: 'var(--font-hand)' } } as const;

type SpriteStyle = CSSProperties & Record<`--${string}`, string>;

interface Sprite {
    id: string;
    /** paper: light theme only, board: dark (chalkboard) only, any: both, in ink or chalk. */
    theme: 'paper' | 'board' | 'any';
    /** `some` shows at the default density; `lots` joins it at the higher one. */
    tier: 'some' | 'lots';
    /** Shown on phones too, at the --m* position. */
    mobile?: true;
    /** Only where wide margins leave room (≥1280px). */
    wide?: true;
    /** Drifts gently, like paper in a draught. */
    drift?: true;
    /** --t/--l/--r/--b/--w place it on desktop; --mt/--ml/--mr/--mb/--mw on phones; --rot tilts it. */
    place: SpriteStyle;
    art: ReactNode;
}

/** Every sprite is a line sketch: pen on the sketchbook, chalk on the board. Each art stays inside its viewBox. */
const SPRITES: readonly Sprite[] = [
    {
        id: 'cloud', theme: 'any', tier: 'some', mobile: true,
        place: { '--t': '1.5rem', '--l': '8.5rem', '--w': '92px', '--rot': '-3deg', '--mt': '6.5rem', '--ml': '0.25rem', '--mw': '54px', color: 'var(--d-slate)' },
        art: <svg viewBox="-2 -3 68 41" {...LINE}><path d="M14 34h36a10 10 0 0 0 1.5-19.9A14 14 0 0 0 24.6 9.6 11 11 0 0 0 7.2 19.4 7.5 7.5 0 0 0 14 34z" /></svg>,
    },
    {
        id: 'pencil-line', theme: 'paper', tier: 'some',
        place: { '--t': '33%', '--l': '2rem', '--w': '70px', '--rot': '-45deg', color: 'var(--d-amber)' },
        art: <svg viewBox="0 0 24 24" {...LINE}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>,
    },
    {
        id: 'bug', theme: 'paper', tier: 'lots',
        place: { '--b': '8rem', '--l': '4rem', '--w': '50px', '--rot': '12deg', color: 'var(--d-red)' },
        art: (
            <svg viewBox="0 0 24 24" {...LINE}>
                <path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
                <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6M12 20v-9" />
                <path d="M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4" />
            </svg>
        ),
    },
    {
        id: 'plane', theme: 'any', tier: 'some', mobile: true, drift: true,
        place: { '--b': '15%', '--r': '5.5rem', '--w': '60px', '--rot': '-12deg', '--mt': '8.5rem', '--mb': 'auto', '--mr': '0.25rem', '--mw': '34px', color: 'var(--d-blue)' },
        art: <svg viewBox="0 0 24 24" {...LINE}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" /></svg>,
    },
    {
        id: 'saturn', theme: 'any', tier: 'some', mobile: true,
        place: { '--b': '5%', '--r': '5%', '--w': '70px', '--rot': '12deg', '--mb': '6.5rem', '--mr': 'auto', '--ml': '0.5rem', '--mw': '42px', color: 'var(--d-purple)' },
        art: <svg viewBox="0 0 70 50" {...LINE}><circle cx="35" cy="25" r="15" /><ellipse cx="35" cy="25" rx="30" ry="10" transform="rotate(-15 35 25)" /></svg>,
    },
    {
        id: 'crane', theme: 'any', tier: 'some', drift: true,
        place: { '--t': '46%', '--r': '4.5rem', '--w': '88px', '--rot': '6deg', color: 'var(--d-red)' },
        art: (
            <svg viewBox="0 0 120 80" {...LINE}>
                <path d="M60 52 20 6l30 52M60 52l42-42-31 48M34 62l26-12 26 12-26 11Zm26-12v23M42 63 9 29l6-1 35 33M9 29l-7 10 13-11M78 63l39-28-6-1-40 27" />
            </svg>
        ),
    },
    {
        id: 'boat', theme: 'any', tier: 'lots', wide: true, drift: true,
        place: { '--b': '18%', '--l': '2.25rem', '--w': '96px', '--rot': '-4deg', color: 'var(--d-blue)' },
        art: (
            <svg viewBox="0 0 120 76" {...LINE}>
                <path d="M60 6 32 48h56ZM60 6v42M8 44h104l-8 8H16ZM16 52h88L90 72H30ZM44 52l10 20M76 52 66 72" />
            </svg>
        ),
    },
    {
        id: 'clip', theme: 'paper', tier: 'some', mobile: true,
        place: { '--t': '1.25rem', '--l': '1.5rem', '--w': '18px', '--rot': '28deg', '--mw': '14px', color: 'var(--d-slate)' },
        art: <svg viewBox="0 0 20 56" {...LINE}><path d="M10 2C4 2 2 5 2 9v38c0 4 3 7 8 7s8-3 8-7V12c0-3-2-5-5-5s-5 2-5 5v31" /></svg>,
    },
    {
        id: 'yarn', theme: 'paper', tier: 'lots', wide: true,
        place: { '--t': '57%', '--l': '1.5rem', '--w': '104px', '--rot': '-6deg', color: 'var(--d-red)' },
        art: (
            <svg viewBox="0 0 120 92" {...LINE}>
                <circle cx="42" cy="50" r="31" />
                <path d="M14 42c16-20 41-22 56-6M12 56c18-20 48-20 60-2M17 70c16-15 40-12 51-2M30 21c-8 20-4 42 10 58M49 19c-8 21-4 43 9 57M68 62c18 9 24-10 36 0s12 22 10 27" />
            </svg>
        ),
    },

    // Chalk on the board.
    {
        id: 'emc2', theme: 'board', tier: 'some', mobile: true,
        place: { '--t': '7rem', '--r': '6.5rem', '--w': '150px', '--rot': '-4deg', '--mt': '9.5rem', '--mr': '0.25rem', '--mw': '78px', color: CHALK_INK.white },
        art: (
            <svg viewBox="0 0 160 70">
                <text x="8" y="44" fontSize="42" {...CHALK_TEXT}>E = mc²</text>
                <path d="M8 56c42-6 92-4 142 2" {...CHALK} />
            </svg>
        ),
    },
    {
        id: 'tree', theme: 'board', tier: 'some',
        place: { '--t': '44%', '--l': '1.25rem', '--w': '118px', '--rot': '-3deg', color: CHALK_INK.blue },
        art: (
            <svg viewBox="0 0 140 110">
                <path d="M64 20 40 42M76 20l24 22M35 56 25 76M45 56l11 20M95 56l-9 20M105 56l11 20" {...CHALK} />
                {[[70, 14], [40, 49], [100, 49], [24, 84], [56, 84], [86, 84], [116, 84]].map(([cx, cy]) => (
                    <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="9" {...CHALK} />
                ))}
                <text x="66" y="18" fontSize="11" {...CHALK_TEXT}>8</text>
                <text x="36" y="53" fontSize="11" {...CHALK_TEXT}>3</text>
                <text x="94" y="53" fontSize="11" {...CHALK_TEXT}>10</text>
            </svg>
        ),
    },
    {
        id: 'bulb', theme: 'board', tier: 'some',
        place: { '--t': '19%', '--l': '3rem', '--w': '60px', '--rot': '-8deg', color: CHALK_INK.yellow },
        art: (
            <svg viewBox="-4 0 78 100">
                <path d="M23 64c0-9-11-15-11-30a23 23 0 0 1 46 0c0 15-11 21-11 30Z" {...CHALK} />
                <path d="M24 72h22M26 80h18M30 88h10M35 10V2M8 18 2 12M62 18l6-6M5 40H-1M65 40h6" {...CHALK} />
            </svg>
        ),
    },
    {
        id: 'code', theme: 'board', tier: 'some',
        place: { '--b': '1.5rem', '--l': '2rem', '--w': '96px', '--rot': '-5deg', color: CHALK_INK.pink },
        art: (
            <svg viewBox="0 0 100 50">
                <path d="M22 10 6 25l16 15M78 10l16 15-16 15M58 6 42 44" {...CHALK} />
            </svg>
        ),
    },
    {
        id: 'sine', theme: 'board', tier: 'lots', wide: true,
        place: { '--b': '13%', '--l': '6rem', '--w': '170px', '--rot': '2deg', color: CHALK_INK.yellow },
        art: (
            <svg viewBox="0 0 180 92">
                <path d="M10 46h160m-6-5 6 5-6 5M14 88V8m-5 6 5-6 5 6" {...CHALK} />
                <path d="M14 46c20-40 40-40 60 0s40 40 60 0 30-28 36-18" {...CHALK} />
                <text x="122" y="24" fontSize="16" {...CHALK_TEXT}>sin x</text>
            </svg>
        ),
    },
    {
        id: 'bigo', theme: 'board', tier: 'lots', wide: true,
        place: { '--t': '31%', '--r': '7rem', '--w': '160px', '--rot': '4deg', color: CHALK_INK.pink },
        art: (
            <svg viewBox="0 0 170 104">
                <text x="6" y="30" fontSize="28" {...CHALK_TEXT}>O(n log n)</text>
                <path d="M20 98V44m0 54h130" {...CHALK} />
                <path d="M22 94c30-6 60-18 90-40 10-7 20-12 30-14" {...CHALK} />
            </svg>
        ),
    },
    {
        id: 'smiley', theme: 'board', tier: 'lots',
        place: { '--b': '30%', '--r': '4rem', '--w': '52px', '--rot': '-10deg', color: CHALK_INK.white },
        art: (
            <svg viewBox="0 0 60 60">
                <circle cx="30" cy="30" r="25" {...CHALK} />
                <path d="M21 23v4M39 23v4M18 36c6 9 18 9 24 0" {...CHALK} />
            </svg>
        ),
    },
    {
        id: 'ship-it', theme: 'board', tier: 'lots', wide: true,
        place: { '--b': '1.25rem', '--r': '12rem', '--w': '140px', '--rot': '-3deg', color: CHALK_INK.white },
        art: (
            <svg viewBox="0 0 150 56">
                <text x="62" y="26" fontSize="22" {...CHALK_TEXT}>ship it!</text>
                <path d="M6 44c30 6 70 4 104-10m-12-3 12 3-6 11" {...CHALK} />
            </svg>
        ),
    },
];

/** Everything sits in the fixed page layer behind the content; app/look.css shows each by theme, density and width. */
export function SketchbookDecor() {
    return (
        <>
            {SPRITES.map((sprite, index) => (
                <div
                    key={sprite.id}
                    className="decor"
                    data-theme={sprite.theme}
                    data-tier={sprite.tier}
                    data-m={sprite.mobile ? '' : undefined}
                    data-wide={sprite.wide ? '' : undefined}
                    data-drift={sprite.drift ? '' : undefined}
                    style={{ ...sprite.place, '--d': index } as CSSProperties}
                >
                    {/* A clip window and the ink inside it slide in opposite directions, so the drawing is wiped on without repainting. */}
                    <div className="decor-wipe">
                        <div className="decor-ink">{sprite.art}</div>
                    </div>
                </div>
            ))}
        </>
    );
}
export const HandDrawnArrow = React.memo(function HandDrawnArrow({ className }: { className?: string }) { return (
    <svg className={className} viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Shaft - Convex Swoop (Bowl shape) */}
        <path
            d="M20 20 Q 90 90 180 60"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
        />
        {/* Arrowhead - Pointing Right/Slightly Up from the swoop */}
        <path
            d="M180 60 L 150 50 M180 60 L 155 80"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
); });
