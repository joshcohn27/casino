import React, { useContext } from "react";
import { motion } from "motion/react";
import PlayingCard from "./Card";
import type { Card as SharedCard } from "../lib/cards";
import { DeckContext } from "../lib/deck";

// A blackjack hand laid out the way a dealer lays it: each card sits over just the corner of
// the one before, stepped up and to the right, so the suit in the middle and both corner
// numbers of every card stay in view. A double-down card is laid sideways, turned so its
// number sits at the bottom-left where a card laid on top of it cannot cover it.
//
// Cards sit in absolutely placed slots, so the hand never changes size as it grows. Past
// four cards the steps tighten up instead of running out of room.

const CARD_CLS = "h-[80px] w-[56px] rounded-[10px] sm:h-[94px] sm:w-[66px] sm:rounded-[12px]";
// --dx / --dy: how far each card steps right and up from the one under it
// 72% across clears the suit, 40% up clears the lower corner number: only the top corner is covered
const VARS = "[--cw:56px] [--ch:80px] sm:[--cw:66px] sm:[--ch:94px] [--dx:calc(var(--cw)*0.72)] [--dy:calc(var(--ch)*0.4)]";
const SLOT_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
// card height over card width, and the sideways step, both in card widths (they match VARS above)
const TALL = 94 / 66;
const STEP_X = 0.72;
// dealt from the shoe, up and to the right
const DEAL_VARIANTS = { initial: { opacity: 0, x: 36, y: -44, scale: 0.94 }, animate: { opacity: 1, x: 0, y: 0, scale: 1 } };

export type StackCard = Pick<SharedCard, "id" | "rank" | "suit"> & {
    /** A double-down card: laid sideways. */
    sideways?: boolean;
};

export default function BlackjackHand({ cards, testId }: { cards: StackCard[]; testId?: string }) {
    // keyed by deck as well as by name, so a card dealt two hands running is a new card on screen
    const deckNo = useContext(DeckContext);
    // Everything below is in card widths. A sideways card is as wide as a card is tall, and
    // every card covers the same small corner of the one under it.
    const widths = cards.map((card) => (card.sideways ? TALL : 1));
    const advance = widths.map((w) => w - 1 + STEP_X);
    const boxWidth = TALL + 3 * STEP_X;
    const run = advance.slice(0, -1).reduce((sum, a) => sum + a, 0);
    const lastWidth = widths[widths.length - 1] ?? 1;
    // room for four upright cards at full step: beyond that the steps shrink to fit
    const fx = run > 0 ? Math.min(1, (boxWidth - lastWidth) / run) : 1;
    const fy = Math.min(1, 3 / Math.max(cards.length - 1, 1));
    // the hand is centered in its box, so it slides over a little as it grows
    const start = (boxWidth - (run * fx + lastWidth)) / 2;
    const lefts = cards.map((_, i) => start + advance.slice(0, i).reduce((sum, a) => sum + a, 0) * fx);

    return (
        <div
            className={`relative ${VARS}`}
            style={{ width: "calc(var(--ch) + 3 * var(--dx))", height: "calc(var(--ch) + 3 * var(--dy))" }}
            data-testid={testId ?? "player-hand"}
        >
            {cards.map((card, i) => {
                // a sideways card turns about its middle, so its box sits half the difference further right
                const left = lefts[i] + (card.sideways ? (TALL - 1) / 2 : 0);
                const style: React.CSSProperties = {
                    position: "absolute",
                    left: `calc(${left.toFixed(4)} * var(--cw))`,
                    bottom: `calc(${i * fy} * var(--dy))`,
                    zIndex: 10 + i,
                    transition: `left 0.35s ${SLOT_EASE}, bottom 0.35s ${SLOT_EASE}`,
                };
                return (
                    <div key={`${deckNo}-${card.id}`} style={style} data-sideways={card.sideways ? "true" : undefined}>
                        <motion.div
                            variants={DEAL_VARIANTS}
                            initial="initial"
                            animate="animate"
                            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <div style={card.sideways ? { transform: "rotate(-90deg)" } : undefined}>
                                <PlayingCard card={{ id: card.id, rank: card.rank, suit: card.suit, faceUp: true }} className={CARD_CLS} />
                            </div>
                        </motion.div>
                    </div>
                );
            })}
        </div>
    );
}
