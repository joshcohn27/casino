import React from 'react';
import { motion } from 'motion/react';
import type { Card } from './cards';

// 'T' is stored internally; show '10' on the card face
const RANK_LABEL: Partial<Record<string, string>> = { T: '10' };
function rankLabel(rank: string) {
    return RANK_LABEL[rank] ?? rank;
}

function isRed(card: Card) {
    return card.suit === '♥' || card.suit === '♦';
}

/* ─── Back ───────────────────────────────────────────────────────────────── */

function Back() {
    return (
        <img
            src="/card-back.svg"
            alt=""
            className="h-full w-full"
            draggable={false}
        />
    );
}

/* ─── Joker face ─────────────────────────────────────────────────────────── */

function JokerFace() {
    return (
        <div className="relative flex h-full w-full items-center justify-center bg-[linear-gradient(145deg,_#fefce8,_#fde68a)] font-bold">
            <div className="absolute left-[5px] top-[5px] leading-tight">
                <div className="text-[11px] font-extrabold text-purple-700">J</div>
                <div className="text-[11px] font-extrabold text-purple-700">K</div>
            </div>
            <div className="absolute bottom-[5px] right-[5px] rotate-180 leading-tight">
                <div className="text-[11px] font-extrabold text-purple-700">J</div>
                <div className="text-[11px] font-extrabold text-purple-700">K</div>
            </div>
            <span className="select-none text-[1.5em] drop-shadow-sm">🃏</span>
        </div>
    );
}

/* ─── Standard face ──────────────────────────────────────────────────────── */

function Front({ card }: { card: Card }) {
    if (card.rank === 'JOKER') return <JokerFace />;

    const color = isRed(card) ? 'text-red-600' : 'text-slate-900';
    const label = rankLabel(card.rank);

    return (
        <div className="relative flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,_#ffffff,_#f4f4f5)] font-bold">
            {/* Top-left pip */}
            <div className={`absolute left-[5px] top-[5px] leading-[0.88] ${color}`}>
                <div className="text-[12px] font-extrabold sm:text-[13px]">{label}</div>
                <div className="mt-[1px] text-[10px] sm:text-[11px]">{card.suit}</div>
            </div>

            {/* Bottom-right pip — rotated 180° */}
            <div className={`absolute bottom-[5px] right-[5px] rotate-180 leading-[0.88] ${color}`}>
                <div className="text-[12px] font-extrabold sm:text-[13px]">{label}</div>
                <div className="mt-[1px] text-[10px] sm:text-[11px]">{card.suit}</div>
            </div>

            {/* Large center suit */}
            <div className={`select-none text-[22px] sm:text-[24px] ${color}`}>
                {card.suit}
            </div>
        </div>
    );
}

/* ─── Public component ───────────────────────────────────────────────────── */

interface Props {
    card: Card;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * Renders a single playing card.
 * Size the card by passing Tailwind size classes via `className`
 * (e.g. "h-[80px] w-[56px] rounded-[10px]").
 * The flip animation runs automatically when card.faceUp changes.
 */
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
                    className="absolute inset-0 overflow-hidden rounded-[inherit] shadow-[0_8px_22px_rgba(0,0,0,0.28)]"
                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                >
                    <Back />
                </div>

                {/* Front face */}
                <div
                    className="absolute inset-0 overflow-hidden rounded-[inherit] border border-slate-300/90 shadow-[0_8px_22px_rgba(0,0,0,0.28)]"
                    style={{
                        transform: 'rotateY(180deg)',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                    }}
                >
                    <Front card={card} />
                </div>
            </motion.div>
        </div>
    );
}
