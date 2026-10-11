import React, { useContext } from "react";
import { motion } from "motion/react";
import PlayingCard from "./Card";
import type { Card as SharedCard } from "./cards";
import { DeckContext } from "./deck";

// One row of cards for the poker-style games.
//
// Cards sit in absolutely placed slots, so they can slide into a new order (for example
// when a hand is sorted after being turned over) and tighten up on narrow screens
// instead of wrapping onto a second line.

const SIZES = {
    sm: { card: "h-[70px] w-[49px] rounded-[9px] sm:h-[82px] sm:w-[57px] sm:rounded-[11px]", vars: "[--cw:49px] [--ch:70px] sm:[--cw:57px] sm:[--ch:82px]", radius: "rounded-[9px] sm:rounded-[11px]" },
    md: { card: "h-[80px] w-[56px] rounded-[10px] sm:h-[94px] sm:w-[66px] sm:rounded-[12px]", vars: "[--cw:56px] [--ch:80px] sm:[--cw:66px] sm:[--ch:94px]", radius: "rounded-[10px] sm:rounded-[12px]" },
} as const;

const SLOT_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const DEAL_VARIANTS = { initial: { opacity: 0, y: -18, scale: 0.94 }, animate: { opacity: 1, y: 0, scale: 1 } };

export type RowCard = Pick<SharedCard, "id" | "rank" | "suit">;

export interface HandRowProps {
    cards: RowCard[];
    /** Card ids in display order, left to right. Defaults to the order of `cards`. */
    order?: string[];
    isFaceUp: (id: string) => boolean;
    /** Cards in this set are shown at full strength; the rest are dimmed. Omit for no dimming. */
    emphasis?: Set<string>;
    onCardClick?: (id: string) => void;
    canClick?: (id: string) => boolean;
    cardLabel?: (id: string) => string;
    size?: keyof typeof SIZES;
    /** Number of slots to reserve width for (defaults to the card count). */
    slots?: number;
    testId?: string;
    /** Seconds before each card starts its deal, by position. Defaults to a quick left-to-right ripple. */
    dealDelay?: (index: number) => number;
    /** Extra placement for one card, for a moment: for example sliding it under its neighbor. */
    slotStyle?: (id: string) => React.CSSProperties | undefined;
    /** Which way a card turns over: -1 lifts its right edge instead of its left. */
    flipDirection?: (id: string) => 1 | -1;
}

export default function HandRow({
    cards, order, isFaceUp, emphasis, onCardClick, canClick, cardLabel, size = "sm", slots, testId, dealDelay, slotStyle, flipDirection,
}: HandRowProps) {
    // cards are keyed by deck as well as by name, so a card dealt two hands running is a new card
    const deckNo = useContext(DeckContext);
    const cfg = SIZES[size];
    const ids = order ?? cards.map((c) => c.id);
    const count = Math.max(ids.length, 1);
    const reserve = Math.max(slots ?? count, 1);
    const step = `min(calc(var(--cw) + 6px), calc((100% - var(--cw)) / ${Math.max(count - 1, 1)}))`;

    return (
        <div
            className={`relative w-full ${cfg.vars}`}
            style={{ height: "var(--ch)", maxWidth: `calc(${reserve} * (var(--cw) + 6px))` }}
            data-testid={testId}
        >
            {cards.map((card, i) => {
                const col = Math.max(ids.indexOf(card.id), 0);
                const faceUp = isFaceUp(card.id);
                const clickable = !!onCardClick && (canClick ? canClick(card.id) : true);
                const dim = emphasis !== undefined && faceUp && !emphasis.has(card.id);
                const style: React.CSSProperties = {
                    position: "absolute",
                    top: 0,
                    left: `calc(50% - var(--cw) / 2 + ${col - (count - 1) / 2} * ${step})`,
                    zIndex: 10 + col,
                    transition: `left 0.4s ${SLOT_EASE}, transform 0.18s ease-out`,
                    ...(slotStyle ? slotStyle(card.id) : undefined),
                };
                const face = (
                    <div className={`transition-opacity duration-300 ${dim ? "opacity-45" : "opacity-100"}`}>
                        <PlayingCard card={{ ...card, faceUp }} className={cfg.card} flipDirection={flipDirection ? flipDirection(card.id) : 1} />
                    </div>
                );
                return (
                    <div key={`${deckNo}-${card.id}`} style={style}>
                        {onCardClick ? (
                            <motion.button
                                data-key-reveal={clickable ? "down" : "up"}
                                onClick={() => onCardClick(card.id)}
                                disabled={!clickable}
                                aria-label={cardLabel ? cardLabel(card.id) : "Card"}
                                variants={DEAL_VARIANTS}
                                initial="initial"
                                animate="animate"
                                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: dealDelay ? dealDelay(i) : i * 0.04 }}
                                whileTap={clickable ? { scale: 0.97 } : undefined}
                                className={`block ${cfg.radius} transition-[translate] duration-150 ${clickable ? "cursor-pointer hover:-translate-y-1" : "cursor-default"}`}
                            >
                                {face}
                            </motion.button>
                        ) : (
                            <motion.div
                                variants={DEAL_VARIANTS}
                                initial="initial"
                                animate="animate"
                                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: dealDelay ? dealDelay(i) : i * 0.04 }}
                            >
                                {face}
                            </motion.div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
