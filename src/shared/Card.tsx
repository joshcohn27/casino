import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { Card } from './cards';
import heartsSvg from '/hearts.svg?url';
import diamondsSvg from '/diamonds.svg?url';
import spadesSvg from '/spades.svg?url';
import clubsSvg from '/clubs.svg?url';

// ─── Constants ────────────────────────────────────────────────────────────────

const RANK_LABEL: Partial<Record<string, string>> = { T: '10' };
function rankLabel(rank: string) { return RANK_LABEL[rank] ?? rank; }

const CARD_RED = '#cc0000';
const CARD_BLACK = '#1a1a1a';

function suitColor(suit: string): string {
    return suit === '♥' || suit === '♦' ? CARD_RED : CARD_BLACK;
}

const RANK_FONT: React.CSSProperties = {
    fontFamily: 'Georgia, serif',
    fontWeight: 700,
};

// ─── Suit SVG helpers ─────────────────────────────────────────────────────────

const SUIT_SRCS: Record<string, string> = {
    '♥': heartsSvg,
    '♦': diamondsSvg,
    '♠': spadesSvg,
    '♣': clubsSvg,
};
function suitSrc(suit: string): string { return SUIT_SRCS[suit] ?? spadesSvg; }

// Plain string paths for center suit — no dynamic import, always resolves.
const SUIT_IMG = {
    '♠': '/spades.svg',
    '♥': '/hearts.svg',
    '♦': '/diamonds.svg',
    '♣': '/clubs.svg',
} as const;

// CSS filter to recolour black-fill SVGs (both hearts.svg and diamonds.svg confirmed fill="#000000").
// Trace for red (#cc0000):
//   brightness(0)       → (0,0,0) black
//   saturate(100%)      → no change (achromatic)
//   invert(16%)         → gray (41,41,41)
//   sepia(99%)          → warm brown (55,49,38), H≈38.5°
//   saturate(3000%)     → fully saturated at H≈38.5°, L≈18.3% → (93,60,0) orange
//   hue-rotate(321deg)  → 38.5+321=359.5°≈0° (red) → (93,0,0)
//   brightness(219%)    → (204,0,0) = #cc0000 ✓
// Note: hue-rotate must be ≈321° (not 0°) to move the sepia base hue to red.
function suitFilter(color: string): string {
    if (color === CARD_RED)
        return 'brightness(0) saturate(100%) invert(16%) sepia(99%) saturate(3000%) hue-rotate(321deg) brightness(219%)';
    return 'brightness(0)'; // force any SVG to solid black
}

// Synchronous <img> — always renders immediately, no async fetch window.
function SuitImg({ suit, color, style }: {
    suit: string; color: string; style?: React.CSSProperties;
}) {
    const src = SUIT_IMG[suit as keyof typeof SUIT_IMG] ?? SUIT_IMG['♠'];

    return (
        <span
            aria-hidden
            style={{
                display: 'block',
                width: 11,
                height: 11,
                flexShrink: 0,
                backgroundColor: color,
                mask: `url("${src}") center / contain no-repeat`,
                WebkitMask: `url("${src}") center / contain no-repeat`,
                ...style,
            }}
        />
    );
}

// ─── Card back ────────────────────────────────────────────────────────────────

function Back() {
    return <img src="/card-back.svg" alt="" className="h-full w-full" draggable={false} />;
}

// ─── Corner pip ───────────────────────────────────────────────────────────────
// Two distinct elements (rank then suit) with a visible gap between them.
// flip=true rotates the whole pip 180° for the bottom two corners.

function Pip({ rank, suit, color, flip = false, compact = false }: {
    rank: string; suit: string; color: string; flip?: boolean; compact?: boolean;
}) {
    return (
        <div
            className="flex flex-col items-center gap-[2px]"
            style={{ transform: flip ? 'rotate(180deg)' : 'none' }}
        >
            <span className={`${compact ? 'text-[13px]' : 'text-[17px]'} leading-none`} style={{ ...RANK_FONT, color }}>{rank}</span>
            {!compact && <SuitImg suit={suit} color={color} style={{ width: 11, height: 11 }} />}
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

function Front({ card, compact = false }: { card: Card; compact?: boolean }) {
    if (card.rank === 'JOKER') return <JokerFace />;

    const color = suitColor(card.suit);
    const label = rankLabel(card.rank);
    const isAce = card.rank === 'A';

    return (
        <div
            className="relative h-full w-full bg-white"
            style={{
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06), inset 0 1px 4px rgba(0,0,0,0.04)',
            }}
        >
            {/* ── Corner pips — top-left + bottom-right always; all four for Ace ── */}
            <div className="absolute left-[5px] top-[4px]">
                <Pip rank={label} suit={card.suit} color={color} compact={compact} />
            </div>
            {isAce && (
                <div className="absolute right-[5px] top-[4px]">
                    <Pip rank={label} suit={card.suit} color={color} compact={compact} />
                </div>
            )}
            {isAce && (
                <div className="absolute bottom-[4px] left-[5px]">
                    <Pip rank={label} suit={card.suit} color={color} flip compact={compact} />
                </div>
            )}
            <div className="absolute bottom-[4px] right-[5px]">
                <Pip rank={label} suit={card.suit} color={color} flip compact={compact} />
            </div>

            {/* ── Center: large suit SVG — hidden in compact mode ── */}
            {!compact && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
                    <span
                        aria-hidden
                        style={{
                            width: '40%',
                            height: '40%',
                            backgroundColor: color,
                            maskImage: `url(${SUIT_IMG[card.suit as keyof typeof SUIT_IMG]})`,
                            WebkitMaskImage: `url(${SUIT_IMG[card.suit as keyof typeof SUIT_IMG]})`,
                            maskRepeat: 'no-repeat',
                            WebkitMaskRepeat: 'no-repeat',
                            maskPosition: 'center',
                            WebkitMaskPosition: 'center',
                            maskSize: 'contain',
                            WebkitMaskSize: 'contain',
                            backfaceVisibility: 'visible',
                            WebkitBackfaceVisibility: 'visible',
                        }}
                    />
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

// Compact threshold: hide suit SVGs only at very small sizes (below minimum card floor).
// Previously 60 caused compact=true on any card narrower than 60px, including the
// Blackjack minimum of 56px, which hid the center suit on most laptops.
const COMPACT_THRESHOLD = 44;

export default function PlayingCard({
    card,
    className = 'w-[clamp(52px,4vw,80px)] h-[clamp(72px,5.6vw,112px)] rounded-[clamp(6px,0.5vw,10px)]',
    style,
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [compact, setCompact] = useState(false);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => {
            setCompact(entry.contentRect.width < COMPACT_THRESHOLD);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div
            ref={containerRef}
            className={`relative shrink-0 [perspective:600px] ${className}`}
            style={style}
        >
            <motion.div
                animate={{ rotateY: card.faceUp ? 180 : 0 }}
                transition={{ duration: 0.42, ease: 'easeInOut' }}
                style={{ transformStyle: 'preserve-3d' }}
                className="relative h-full w-full rounded-[inherit]"
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
                    <Front card={card} compact={compact} />
                </div>
            </motion.div>
        </div>
    );
}
