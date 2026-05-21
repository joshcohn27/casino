import React from 'react';
import { motion } from 'motion/react';
import type { Card } from './cards';

// ─── Constants ────────────────────────────────────────────────────────────────

const RANK_LABEL: Partial<Record<string, string>> = { T: '10' };
function rankLabel(rank: string) { return RANK_LABEL[rank] ?? rank; }

const CARD_RED   = '#cc0000';
const CARD_BLACK = '#1a1a1a';
const CARD_CLUB  = '#1a2e1a';   // dark charcoal-green — distinct from spade black at small sizes

function suitColor(suit: string) {
    if (suit === '♥' || suit === '♦') return CARD_RED;
    if (suit === '♣') return CARD_CLUB;
    return CARD_BLACK;
}

const RANK_FONT: React.CSSProperties = {
    fontFamily: 'Georgia, "Palatino Linotype", Palatino, serif',
    fontWeight: 700,
};

// ─── Pip position map ─────────────────────────────────────────────────────────
// [x%, y%, flip?]  —  x/y are percentages of the full card face.
// flip=true → pip rotated 180° (bottom-half pips point "down" like real cards).
//
// Zone rule (three strict zones, no overlap):
//   Corner pips: top ~29% and bottom ~29%.
//   Center pips: middle zone — y clamped to [38, 62].
// 8 px glyphs at 8 % column steps (≈6.5 px on an 82 px card) keeps column
// pips visually clear; center extras (7, 9, T) are at different x so they
// never visually collide with column pips.

type PipPos = [number, number, boolean?];

const PIP_POSITIONS: Record<string, PipPos[]> = {
    // 2 — top / bottom
    '2': [
        [50, 38],
        [50, 62, true],
    ],
    // 3 — top / center / bottom (14 % steps)
    '3': [
        [50, 38],
        [50, 50],
        [50, 62, true],
    ],
    // 4 — two columns × two rows
    '4': [
        [31, 38],        [69, 38],
        [31, 62, true],  [69, 62, true],
    ],
    // 5 — four corners + center
    '5': [
        [31, 38],        [69, 38],
                [50, 50],
        [31, 62, true],  [69, 62, true],
    ],
    // 6 — two columns × three rows (12 % steps)
    '6': [
        [31, 38],        [69, 38],
        [31, 50],        [69, 50],
        [31, 62, true],  [69, 62, true],
    ],
    // 7 — three rows + one center extra between rows 1 and 2
    '7': [
        [31, 38],        [69, 38],
                [50, 44],
        [31, 50],        [69, 50],
        [31, 62, true],  [69, 62, true],
    ],
    // 8 — four rows × two columns (8 % steps, standard layout)
    '8': [
        [31, 38],        [69, 38],
        [31, 46],        [69, 46],
        [31, 54, true],  [69, 54, true],
        [31, 62, true],  [69, 62, true],
    ],
    // 9 — four columns rows + center pip (8 % column steps)
    '9': [
        [31, 38],        [69, 38],
        [31, 46],        [69, 46],
                [50, 50],
        [31, 54, true],  [69, 54, true],
        [31, 62, true],  [69, 62, true],
    ],
    // T (10) — four column rows + two center extras between rows 1-2 and 3-4
    'T': [
        [31, 38],        [69, 38],
                [50, 42],
        [31, 46],        [69, 46],
        [31, 54, true],  [69, 54, true],
                [50, 58, true],
        [31, 62, true],  [69, 62, true],
    ],
};

// ─── Card back ────────────────────────────────────────────────────────────────

function Back() {
    return <img src="/card-back.svg" alt="" className="h-full w-full" draggable={false} />;
}

// ─── Corner pip ───────────────────────────────────────────────────────────────
// Two distinct elements (rank then suit) with a visible gap between them.
// flip=true rotates the whole pip 180° for the bottom two corners.

function Pip({ rank, suit, color, flip = false }: {
    rank: string; suit: string; color: string; flip?: boolean;
}) {
    return (
        <div
            className="flex flex-col items-center gap-[2px]"
            style={{ color, transform: flip ? 'rotate(180deg)' : 'none' }}
        >
            <span className="text-[15px] leading-none" style={RANK_FONT}>{rank}</span>
            <span className="text-[11px] leading-none">{suit}</span>
        </div>
    );
}

// ─── Joker face ───────────────────────────────────────────────────────────────

function JokerPip({ flip }: { flip?: boolean }) {
    return (
        <div
            className="flex flex-col items-center gap-[3px]"
            style={{ color: '#6b21a8', transform: flip ? 'rotate(180deg)' : 'none', ...RANK_FONT }}
        >
            <span className="text-[11px] leading-none">J</span>
            <span className="text-[11px] leading-none">K</span>
        </div>
    );
}

function JokerFace() {
    return (
        <div className="relative flex h-full w-full items-center justify-center
                        bg-[linear-gradient(145deg,_#fefce8,_#fde68a)]">
            <div className="absolute left-[5px] top-[4px]"><JokerPip /></div>
            <div className="absolute right-[5px] top-[4px]"><JokerPip /></div>
            <div className="absolute bottom-[4px] left-[5px]"><JokerPip flip /></div>
            <div className="absolute bottom-[4px] right-[5px]"><JokerPip flip /></div>
            <span className="select-none text-[1.5em] drop-shadow-sm">🃏</span>
        </div>
    );
}

// ─── Standard card face ───────────────────────────────────────────────────────

function Front({ card }: { card: Card }) {
    if (card.rank === 'JOKER') return <JokerFace />;

    const color = suitColor(card.suit);
    const label = rankLabel(card.rank);
    const pips  = PIP_POSITIONS[card.rank];
    const isFace = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
    const isAce  = card.rank === 'A';

    return (
        <div
            className="relative h-full w-full bg-white"
            style={{
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06), inset 0 1px 4px rgba(0,0,0,0.04)',
            }}
        >
            {/* ── Corner pips — top-left + bottom-right always; all four for Ace ── */}
            <div className="absolute left-[5px] top-[4px]">
                <Pip rank={label} suit={card.suit} color={color} />
            </div>
            {isAce && (
                <div className="absolute right-[5px] top-[4px]">
                    <Pip rank={label} suit={card.suit} color={color} />
                </div>
            )}
            {isAce && (
                <div className="absolute bottom-[4px] left-[5px]">
                    <Pip rank={label} suit={card.suit} color={color} flip />
                </div>
            )}
            <div className="absolute bottom-[4px] right-[5px]">
                <Pip rank={label} suit={card.suit} color={color} flip />
            </div>

            {/* ── Center: Ace — single large suit ── */}
            {isAce && (
                <div
                    className="absolute inset-0 flex items-center justify-center select-none"
                    style={{ color, fontSize: '32px', lineHeight: 1 }}
                >
                    {card.suit}
                </div>
            )}

            {/* ── Center: 2-10 — traditional pip pattern ── */}
            {pips?.map(([x, y, flip], i) => (
                <div
                    key={i}
                    className="pointer-events-none absolute select-none"
                    style={{
                        left:      `${x}%`,
                        top:       `${y}%`,
                        transform: `translate(-50%, -50%)${flip ? ' rotate(180deg)' : ''}`,
                        color,
                        fontSize:  '9px',
                        lineHeight: 1,
                    }}
                >
                    {card.suit}
                </div>
            ))}

            {/* ── Center: J / Q / K — large rank letter + suit ── */}
            {isFace && (
                <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-1 select-none"
                    style={{ color }}
                >
                    <span className="text-[22px] leading-none" style={RANK_FONT}>{label}</span>
                    <span className="text-[14px] leading-none">{card.suit}</span>
                </div>
            )}
        </div>
    );
}

// ─── Public component ─────────────────────────────────────────────────────────
// Size via `className`, e.g. "w-[60px] h-[84px] rounded-[10px]" (5∶7 ratio).

interface Props {
    card: Card;
    className?: string;
    style?: React.CSSProperties;
}

export default function PlayingCard({ card, className = '', style }: Props) {
    return (
        <div
            className={`relative shrink-0 [perspective:600px] ${className}`}
            style={style}
        >
            <motion.div
                animate={{ rotateY: card.faceUp ? 180 : 0 }}
                transition={{ duration: 0.42, ease: 'easeInOut' }}
                style={{ transformStyle: 'preserve-3d' }}
                className="relative h-full w-full"
            >
                {/* Back face */}
                <div
                    className="absolute inset-0 overflow-hidden rounded-[inherit]"
                    style={{
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.20), 0 1px 3px rgba(0,0,0,0.14)',
                    }}
                >
                    <Back />
                </div>

                {/* Front face */}
                <div
                    className="absolute inset-0 overflow-hidden rounded-[inherit] border border-slate-200/80"
                    style={{
                        transform: 'rotateY(180deg)',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.20), 0 1px 3px rgba(0,0,0,0.14)',
                    }}
                >
                    <Front card={card} />
                </div>
            </motion.div>
        </div>
    );
}
