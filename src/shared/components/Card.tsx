import React, { useContext } from 'react';
import { motion } from 'motion/react';
import type { Card } from '../lib/cards';
import { DeckContext, deckBackSrc } from '../lib/deck';

// ─── Constants ────────────────────────────────────────────────────────────────

const RANK_LABEL: Partial<Record<string, string>> = { T: '10' };
function rankLabel(rank: string) { return RANK_LABEL[rank] ?? rank; }

const CARD_RED   = '#cc0000';
const CARD_BLACK = '#1a1a1a';
const CARD_CLUB  = '#1a2e1a';

function suitColor(suit: string) {
    if (suit === '♥' || suit === '♦') return CARD_RED;
    if (suit === '♣') return CARD_CLUB;
    return CARD_BLACK;
}

function suitFilter(suit: string): string {
    if (suit === '♥' || suit === '♦')
        return 'brightness(0) saturate(100%) invert(16%) sepia(99%) saturate(3000%) hue-rotate(0deg)';
    if (suit === '♣')
        return 'brightness(0) saturate(100%) invert(10%) sepia(40%) saturate(400%) hue-rotate(90deg)';
    return 'brightness(0)';
}

function suitSrc(suit: string): string {
    if (suit === '♥') return '/hearts.svg';
    if (suit === '♦') return '/diamonds.svg';
    if (suit === '♣') return '/clubs.svg';
    return '/spades.svg';
}

const RANK_FONT: React.CSSProperties = {
    fontWeight: 700,
};

// ─── Card back ────────────────────────────────────────────────────────────────

function Back() {
    // gold or purple, whichever deck this hand was dealt from
    const deckNo = useContext(DeckContext);
    return <img src={deckBackSrc(deckNo)} alt="" className="h-full w-full" style={{ objectFit: "contain", padding: "2px" }} draggable={false} />;
}

// ─── Corner pip — rank only, no suit symbol ───────────────────────────────────

function Pip({ rank, color, flip = false }: {
    rank: string; color: string; flip?: boolean;
}) {
    return (
        <div style={{ color, transform: flip ? 'rotate(180deg)' : 'none' }}>
            <span className="text-[20px] leading-none" style={RANK_FONT}>{rank}</span>
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
        <div className="relative flex h-full w-full items-center justify-center rounded-[inherit]
                        bg-[#fef3c7]">
            <div className="absolute left-[5px] top-[4px]"><JokerPip /></div>
            <div className="absolute right-[5px] top-[4px]"><JokerPip /></div>
            <div className="absolute bottom-[4px] left-[5px]"><JokerPip flip /></div>
            <div className="absolute bottom-[4px] right-[5px]"><JokerPip flip /></div>
            <span className="select-none text-[1.5em]">🃏</span>
        </div>
    );
}

// ─── Standard card face ───────────────────────────────────────────────────────

function Front({ card }: { card: Card }) {
    if (card.rank === 'JOKER') return <JokerFace />;

    const color = suitColor(card.suit);
    const label = rankLabel(card.rank);
    const isAce = card.rank === 'A';

    return (
        <div
            className="relative h-full w-full overflow-hidden rounded-[inherit] bg-white"

        >
            {/* Top-left corner pip */}
            <div className="absolute left-[5px] top-[4px]">
                <Pip rank={label} color={color} />
            </div>
            {/* Top-right (Ace only) */}
            {isAce && (
                <div className="absolute right-[5px] top-[4px]">
                    <Pip rank={label} color={color} />
                </div>
            )}
            {/* Bottom-left (Ace only) */}
            {isAce && (
                <div className="absolute bottom-[4px] left-[5px]">
                    <Pip rank={label} color={color} flip />
                </div>
            )}
            {/* Bottom-right corner pip */}
            <div className="absolute bottom-[4px] right-[5px]">
                <Pip rank={label} color={color} flip />
            </div>

            {/* Center: single large suit SVG — same for every card */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
                <img
                    src={suitSrc(card.suit)}
                    alt={card.suit}
                    draggable={false}
                    style={{
                        width: '42%',
                        height: '42%',
                        objectFit: 'contain',
                        filter: suitFilter(card.suit),
                    }}
                />
            </div>
        </div>
    );
}

// ─── Public component ─────────────────────────────────────────────────────────

interface Props {
    card: Card;
    className?: string;
    style?: React.CSSProperties;
    /**
     * Which way the card turns over. 1 (the default) lifts its left edge, -1 lifts its right
     * edge: the way it goes when a card is slid under that side to flip it.
     */
    flipDirection?: 1 | -1;
}

export default function PlayingCard({ card, className = '', style, flipDirection = 1 }: Props) {
    return (
        <div
            className={`relative shrink-0 [perspective:600px] ${className}`}
            style={style}
            data-card={card.id}
            data-face-up={card.faceUp ? "true" : "false"}
        >
            <motion.div
                animate={{ rotateY: card.faceUp ? 180 * flipDirection : 0 }}
                transition={{ duration: 0.42, ease: 'easeInOut' }}
                style={{ transformStyle: 'preserve-3d' }}
                className="relative h-full w-full rounded-[inherit]"
            >
                {/* Back face: white to the edge, so the card back fills its outline */}
                <div
                    className="absolute inset-0 overflow-hidden rounded-[inherit] bg-white"
                    style={{
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        border: '1px solid rgba(0,0,0,0.45)',
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
                        border: '1px solid rgba(0,0,0,0.45)',
                    }}
                >
                    <Front card={card} />
                </div>
            </motion.div>
        </div>
    );
}