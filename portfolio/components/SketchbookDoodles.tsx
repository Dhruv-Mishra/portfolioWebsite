import React, { type CSSProperties, type ReactNode } from 'react';
import { DECOR_PALETTE as P } from '@/lib/designTokens';

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
    /** paper: light theme only, board: dark (chalkboard) only, any: both. */
    theme: 'paper' | 'board' | 'any';
    /** `some` shows at the default density; `lots` joins it at the higher one. */
    tier: 'some' | 'lots';
    /** Shown on phones too, at the --m* position. */
    mobile?: true;
    /** Only where wide margins leave room (≥1280px). */
    wide?: true;
    /** Drifts gently, like paper in a draught. */
    drift?: true;
    /** A real thing lying on the board (not chalk), so it keeps solid strokes and is not written on. */
    object?: true;
    /** --t/--l/--r/--b/--w place it on desktop; --mt/--ml/--mr/--mb/--mw on phones; --rot tilts it. */
    place: SpriteStyle;
    art: ReactNode;
}

const SPRITES: readonly Sprite[] = [
    {
        id: 'cloud', theme: 'any', tier: 'some', mobile: true,
        place: { '--t': '1.5rem', '--l': '8.5rem', '--w': '92px', '--rot': '-3deg', '--mt': '6.5rem', '--ml': '0.25rem', '--mw': '54px', color: 'var(--d-slate)' },
        art: <svg viewBox="0 0 24 24" {...LINE}><path d="M17.5 19c0-1.7-1.3-3-3-3h-1.1c-.1-2.6-2.2-4.7-4.8-4.7-2.3 0-4.3 1.7-4.7 3.9-.3-.1-.5-.2-.9-.2-2.2 0-4 1.8-4 4s1.8 4 4 4h14.5c1.4 0 2.5-1.1 2.5-2.5z" /></svg>,
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

    // Desk props and origami on the sketchbook.
    {
        id: 'clip', theme: 'paper', tier: 'some', mobile: true,
        place: { '--t': '1.25rem', '--l': '1.5rem', '--w': '18px', '--rot': '28deg', '--mw': '14px' },
        art: (
            <svg viewBox="0 0 20 56" fill="none">
                <defs>
                    <linearGradient id="decor-steel" x1="0" x2="1" y1="0" y2="0.4">
                        <stop offset="0" stopColor={P.steel.dark} />
                        <stop offset="0.45" stopColor={P.steel.light} />
                        <stop offset="1" stopColor={P.steel.mid} />
                    </linearGradient>
                </defs>
                <path d="M10 2C4 2 2 5 2 9v38c0 4 3 7 8 7s8-3 8-7V12c0-3-2-5-5-5s-5 2-5 5v31" stroke="url(#decor-steel)" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
        ),
    },
    {
        id: 'crane', theme: 'paper', tier: 'some', drift: true,
        place: { '--t': '17%', '--r': '5.75rem', '--w': '92px', '--rot': '6deg' },
        art: (
            <svg viewBox="0 0 120 86">
                <ellipse cx="60" cy="81" rx="34" ry="3.5" fill={P.shadow} />
                <polygon points="60,52 20,6 50,58" fill={P.crane.light} />
                <polygon points="60,52 102,10 71,58" fill={P.crane.mid} />
                <polygon points="34,62 60,50 86,62 60,73" fill={P.crane.dark} />
                <polygon points="60,50 86,62 60,73" fill={P.crane.mid} />
                <polygon points="42,63 9,29 15,28 50,61" fill={P.crane.light} />
                <polygon points="9,29 2,39 15,28" fill={P.crane.dark} />
                <polygon points="78,63 117,35 111,34 71,61" fill={P.crane.mid} />
            </svg>
        ),
    },
    {
        id: 'boat', theme: 'paper', tier: 'lots', wide: true, drift: true,
        place: { '--b': '18%', '--l': '2.25rem', '--w': '96px', '--rot': '-4deg' },
        art: (
            <svg viewBox="0 0 120 80">
                <ellipse cx="60" cy="76" rx="40" ry="3.5" fill={P.shadow} />
                <polygon points="60,6 32,48 60,48" fill={P.boat.light} />
                <polygon points="60,6 60,48 88,48" fill={P.boat.mid} />
                <polygon points="8,44 112,44 104,52 16,52" fill={P.boat.dark} />
                <polygon points="16,52 104,52 90,72 30,72" fill={P.boat.mid} />
                <polygon points="44,52 76,52 66,72 54,72" fill={P.boat.light} />
            </svg>
        ),
    },
    {
        id: 'washi', theme: 'paper', tier: 'some',
        place: { '--t': '47%', '--r': '4rem', '--w': '124px', '--rot': '-58deg' },
        art: (
            <svg viewBox="0 0 140 30">
                <defs>
                    <pattern id="decor-washi" width="10" height="10" patternUnits="userSpaceOnUse">
                        <circle cx="5" cy="5" r="1.6" fill={P.washi.dot} />
                    </pattern>
                </defs>
                <polygon points="4,2 136,0 133,6 138,11 133,17 138,23 135,30 3,28 7,22 2,16 6,10 2,5" fill={P.washi.base} opacity="0.9" />
                <polygon points="4,2 136,0 133,6 138,11 133,17 138,23 135,30 3,28 7,22 2,16 6,10 2,5" fill="url(#decor-washi)" />
            </svg>
        ),
    },
    {
        id: 'pencil', theme: 'paper', tier: 'lots', wide: true,
        place: { '--b': '2.25rem', '--r': '10rem', '--w': '230px', '--rot': '-7deg' },
        art: (
            <svg viewBox="0 0 240 28">
                <ellipse cx="120" cy="25" rx="112" ry="2.5" fill={P.shadow} />
                <rect x="1" y="5" width="21" height="14" rx="5" fill={P.pencil.eraser} />
                <rect x="18" y="4" width="17" height="16" fill={P.steel.mid} />
                <path d="M22 4v16M27 4v16M31 4v16" stroke={P.steel.light} strokeWidth="1.2" />
                <rect x="35" y="4" width="160" height="16" fill={P.pencil.mid} />
                <rect x="35" y="4" width="160" height="5" fill={P.pencil.light} />
                <rect x="35" y="15" width="160" height="5" fill={P.pencil.dark} />
                <polygon points="195,4 229,12 195,20" fill={P.pencil.wood} />
                <polygon points="220,10 233,12 220,14" fill={P.pencil.graphite} />
            </svg>
        ),
    },
    {
        id: 'eraser', theme: 'paper', tier: 'lots', wide: true,
        place: { '--b': '3rem', '--l': '7.5rem', '--w': '76px', '--rot': '9deg' },
        art: (
            <svg viewBox="0 0 90 46" fill="none">
                <ellipse cx="38" cy="40" rx="32" ry="3" fill={P.shadow} />
                <rect x="4" y="8" width="62" height="27" rx="6" fill={P.eraser.body} />
                <rect x="27" y="6" width="40" height="31" rx="3" fill={P.eraser.sleeve} />
                <path d="M33 14h26M33 20h18" stroke={P.eraser.body} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
                <path d="M70 34c3-3 7-2 7 1s-5 3-6 1M79 28c2-2 5-1 5 1M74 41c2 0 4 1 3 3" stroke={P.eraser.crumb} strokeWidth="1.6" strokeLinecap="round" />
            </svg>
        ),
    },
    {
        id: 'yarn', theme: 'paper', tier: 'lots', wide: true,
        place: { '--t': '57%', '--l': '1.5rem', '--w': '112px', '--rot': '-6deg' },
        art: (
            <svg viewBox="0 0 120 92" fill="none" strokeLinecap="round">
                <ellipse cx="44" cy="86" rx="30" ry="3.5" fill={P.shadow} />
                <circle cx="42" cy="50" r="31" fill={P.yarn.base} />
                <path d="M14 42c16-20 41-22 56-6M12 56c18-20 48-20 60-2M17 70c16-15 40-12 51-2" stroke={P.yarn.light} strokeWidth="3" />
                <path d="M30 21c-8 20-4 42 10 58M49 19c-8 21-4 43 9 57M64 28c-7 16-6 34 2 46" stroke={P.yarn.dark} strokeWidth="2.6" />
                <path d="M20 34c14-10 34-12 46-4M16 63c14-10 36-10 52-3" stroke={P.yarn.light} strokeWidth="1.2" strokeDasharray="1 3" />
                <path d="M68 62c18 9 24-10 36 0s12 22 10 27" stroke={P.yarn.base} strokeWidth="2.6" />
            </svg>
        ),
    },

    // Chalk on the board.
    {
        id: 'emc2', theme: 'board', tier: 'some', mobile: true,
        place: { '--t': '7rem', '--r': '6.5rem', '--w': '150px', '--rot': '-4deg', '--mt': '9.5rem', '--mr': '0.25rem', '--mw': '78px', color: P.chalk.white },
        art: (
            <svg viewBox="0 0 160 70">
                <text x="8" y="44" fontSize="42" {...CHALK_TEXT}>E = mc²</text>
                <path d="M8 56c42-6 92-4 142 2" {...CHALK} />
            </svg>
        ),
    },
    {
        id: 'tree', theme: 'board', tier: 'some',
        place: { '--t': '44%', '--l': '1.25rem', '--w': '118px', '--rot': '-3deg', color: P.chalk.blue },
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
        place: { '--t': '19%', '--l': '3rem', '--w': '54px', '--rot': '-8deg', color: P.chalk.yellow },
        art: (
            <svg viewBox="0 0 70 100">
                <path d="M23 64c0-9-11-15-11-30a23 23 0 0 1 46 0c0 15-11 21-11 30Z" {...CHALK} />
                <path d="M24 72h22M26 80h18M30 88h10M35 10V2M8 18 2 12M62 18l6-6M5 40H-1M65 40h6" {...CHALK} />
            </svg>
        ),
    },
    {
        id: 'sine', theme: 'board', tier: 'lots', wide: true,
        place: { '--b': '13%', '--l': '6rem', '--w': '170px', '--rot': '2deg', color: P.chalk.yellow },
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
        place: { '--t': '31%', '--r': '7rem', '--w': '160px', '--rot': '4deg', color: P.chalk.pink },
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
        place: { '--b': '30%', '--r': '4rem', '--w': '52px', '--rot': '-10deg', color: P.chalk.white },
        art: (
            <svg viewBox="0 0 60 60">
                <circle cx="30" cy="30" r="25" {...CHALK} />
                <path d="M21 23v4M39 23v4M18 36c6 9 18 9 24 0" {...CHALK} />
            </svg>
        ),
    },
    {
        id: 'chalk-sticks', theme: 'board', tier: 'some', mobile: true, object: true,
        place: { '--b': '0.75rem', '--l': '1rem', '--w': '112px', '--mb': '0.5rem', '--ml': '0.25rem', '--mw': '78px' },
        art: (
            <svg viewBox="0 0 120 42">
                <ellipse cx="58" cy="36" rx="52" ry="4" fill={P.shadow} />
                <g transform="rotate(-5 30 22)">
                    <rect x="6" y="16" width="50" height="10" rx="5" fill={P.chalk.white} />
                    <rect x="6" y="21" width="50" height="5" rx="2.5" fill={P.chalk.white} opacity="0.75" />
                </g>
                <g transform="rotate(4 80 26)">
                    <rect x="54" y="22" width="44" height="10" rx="5" fill={P.chalk.pink} />
                    <rect x="54" y="27" width="44" height="5" rx="2.5" fill={P.chalk.pink} opacity="0.7" />
                </g>
                <rect x="86" y="10" width="26" height="9" rx="4.5" fill={P.chalk.blue} transform="rotate(-12 99 14)" />
                <ellipse cx="34" cy="33" rx="18" ry="2" fill={P.chalk.white} opacity="0.25" />
            </svg>
        ),
    },
    {
        id: 'duster', theme: 'board', tier: 'some', object: true,
        place: { '--b': '1rem', '--r': '12rem', '--w': '132px', '--rot': '-3deg' },
        art: (
            <svg viewBox="0 0 132 52">
                <ellipse cx="66" cy="47" rx="60" ry="4" fill={P.shadow} />
                <rect x="6" y="6" width="120" height="25" rx="7" fill={P.wood.base} />
                <rect x="6" y="6" width="120" height="8" rx="4" fill={P.wood.light} />
                <path d="M16 18c20-3 40 3 62-1s30 2 40 0M20 25c26 2 50-3 90 1" stroke={P.wood.dark} strokeWidth="1" fill="none" opacity="0.6" />
                <rect x="8" y="29" width="116" height="14" rx="3" fill={P.felt.base} />
                <path d="M12 34h108M12 38h108" stroke={P.felt.fiber} strokeWidth="1.4" strokeDasharray="1 2.5" />
                <rect x="10" y="40" width="112" height="3" rx="1.5" fill={P.chalk.white} opacity="0.35" />
            </svg>
        ),
    },
    {
        id: 'magnet-note', theme: 'board', tier: 'lots', wide: true, object: true,
        place: { '--t': '64%', '--l': '1.75rem', '--w': '78px', '--rot': '-6deg' },
        art: (
            <svg viewBox="0 0 80 84">
                <rect x="10" y="12" width="60" height="64" fill={P.paper} transform="rotate(3 40 44)" />
                <path d="M18 34h42M18 44h36M18 54h40M18 64h24" stroke={P.felt.fiber} strokeWidth="1.4" opacity="0.6" transform="rotate(3 40 44)" />
                <circle cx="40" cy="14" r="9" fill={P.magnet} />
                <circle cx="37" cy="11" r="3" fill={P.paper} opacity="0.55" />
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
                    data-object={sprite.object ? '' : undefined}
                    style={{ ...sprite.place, '--d': index } as CSSProperties}
                >
                    {sprite.art}
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
