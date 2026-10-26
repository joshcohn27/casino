import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "../../shared/components/TableShell";
import ChipTray from "../../shared/components/ChipTray";
import HandRow from "../../shared/components/HandRow";
import BlackjackHand from "../../shared/components/BlackjackHand";
import type { Card as SharedCard } from "../../shared/lib/cards";
import { addChipToStack, type ChipDenomination, formatMoney, buildChipStackFromAmount, popLastChip, BTN_NEUTRAL, BTN_GOLD, BTN_GREEN } from "../../shared/lib/money";
import BetSpot, { BetBar } from "../../shared/components/BetSpot";
import { SlideBtn } from "../../shared/components/SlideBtn";
import { defaultBet } from "../../shared/state/settings";
import { useBetRecorder } from "../../shared/state/sessionContext";

// ─── Types (preserved) ───────────────────────────────────────────────────────

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

type Card = {
    rank: Rank;
    suit: Suit;
    value: number;
    id: string;
    /** A double-down card, laid sideways. */
    sideways?: boolean;
};

type Props = {
    bankroll: number;
    setBankroll: React.Dispatch<React.SetStateAction<number>>;
};

type Stage = "betting" | "dealing" | "player" | "dealer" | "done";
type DoubleType = "none" | "paid" | "free";

type HandBet = {
    amount: number;
    isFree: boolean;
};

type HandState = {
    cards: Card[];
    baseBet: HandBet;
    doubleType: DoubleType;
    /** What a paid double cost. Less than the base bet when the player doubled for less. */
    doubleAmount?: number;
    splitDepth: number;
    result: string;
    settlementText: string[];
    totalReturn: number;
    netProfit: number;
};

type SideBetSnapshot = {
    push22: number;
    potOfGold: number;
};

type SideBetBreakdown = {
    name: string;
    wager: number;
    totalReturn: number;
    netProfit: number;
    detail: string;
    resultText: string;
};

type RoundBreakdown = {
    totalReturned: number;
    totalNet: number;
    lines: string[];
    sideBets: SideBetBreakdown[];
};

// ─── Game constants (preserved) ──────────────────────────────────────────────

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"] as Suit[];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

const MIN_BET = 5;
const MAX_HANDS = 4;
const BET_STORAGE_KEY = "casino-freebet-blackjack-bet";
const PUSH22_STORAGE_KEY = "casino-freebet-blackjack-push22";
const POT_OF_GOLD_STORAGE_KEY = "casino-freebet-blackjack-potofgold";

const SHOE_DECKS = 6;
const SHOE_SIZE = SHOE_DECKS * 52;
const SHUFFLE_PENETRATION = 0.85;
const SHUFFLE_DELAY_MS = 2000;
const RESHUFFLE_REMAINING_CARDS = Math.ceil(SHOE_SIZE * (1 - SHUFFLE_PENETRATION));
const PLAYER_TO_DEALER_DELAY_MS = 500;
// Standing has no new card to look at, so the dealer starts almost at once
const STAND_TO_DEALER_DELAY_MS = 120;
// One dealer card: long enough for a card to land, or for the hole card to turn over
const DEALER_CARD_MS = 480;
// The deal goes player, dealer, player, dealer, one card at a time
const DEAL_CARD_MS = 380;

const SIDE_MAX = 100;
const SIDE_STEP = 2.5;

// ─── UI constants ─────────────────────────────────────────────────────────────

const CARD_CLS = "h-[80px] w-[56px] rounded-[10px] sm:h-[94px] sm:w-[66px] sm:rounded-[12px]";


// ─── Game pure functions (preserved) ─────────────────────────────────────────

function shuffle<T>(arr: T[]) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function createShoe(): Card[] {
    const shoe: Card[] = [];
    for (let deckIndex = 0; deckIndex < SHOE_DECKS; deckIndex++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                let value = Number(rank);
                if (["J", "Q", "K"].includes(rank)) value = 10;
                if (rank === "A") value = 11;
                shoe.push({
                    rank,
                    suit,
                    value,
                    id: `${deckIndex}-${rank}${suit}-${Math.random().toString(36).slice(2, 9)}`,
                });
            }
        }
    }
    return shuffle(shoe);
}

function total(cards: Card[]) {
    let sum = cards.reduce((acc, card) => acc + card.value, 0);
    let aces = cards.filter((card) => card.rank === "A").length;
    while (sum > 21 && aces > 0) {
        sum -= 10;
        aces--;
    }
    return sum;
}

function isSoft(cards: Card[]) {
    let sum = cards.reduce((acc, card) => acc + card.value, 0);
    let aces = cards.filter((card) => card.rank === "A").length;
    while (sum > 21 && aces > 0) {
        sum -= 10;
        aces--;
    }
    if (sum === 21) return false;
    return aces > 0;
}

function isBlackjack(cards: Card[]) {
    return cards.length === 2 && total(cards) === 21;
}

function shouldShuffle(shoe: Card[]) {
    return shoe.length <= RESHUFFLE_REMAINING_CARDS || shoe.length < 20;
}

function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function waitForPaint() {
    return new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
        });
    });
}

function isTenValue(rank: Rank) {
    return rank === "10" || rank === "J" || rank === "Q" || rank === "K";
}

function canSplitRanks(cards: Card[]) {
    if (cards.length !== 2) return false;
    const [a, b] = cards;
    if (a.rank === b.rank) return true;
    return isTenValue(a.rank) && isTenValue(b.rank);
}

function isFreeSplit(cards: Card[]) {
    if (!canSplitRanks(cards)) return false;
    const rank = cards[0]?.rank;
    if (!rank) return false;
    if (rank === "A") return true;
    if (rank === "10" || rank === "J" || rank === "Q" || rank === "K") return false;
    return Number(rank) >= 2 && Number(rank) <= 9;
}

function isHardFreeDouble(cards: Card[]) {
    return cards.length === 2 && !isSoft(cards) && [9, 10, 11].includes(total(cards));
}

function potOfGoldMultiplier(tokens: number) {
    if (tokens >= 7) return 1000;
    if (tokens === 6) return 300;
    if (tokens === 5) return 100;
    if (tokens === 4) return 60;
    if (tokens === 3) return 30;
    if (tokens === 2) return 10;
    if (tokens === 1) return 3;
    return 0;
}

function clampMainBet(value: number) {
    return Math.max(MIN_BET, Math.floor(value / 2.5) * 2.5);
}

function clampSideBet(value: number) {
    return Math.max(0, Math.min(SIDE_MAX, Math.floor(value / SIDE_STEP) * SIDE_STEP));
}

function getHandOutcomeLabel(
    handTotal: number,
    dealerTotal: number,
    dealerHas22: boolean,
    busted: boolean,
    dealerBusted: boolean
) {
    if (busted) return "Bust";
    if (dealerHas22) return "Push 22";
    if (dealerBusted) return "Win";
    if (handTotal > dealerTotal) return "Win";
    if (handTotal < dealerTotal) return "Lose";
    return "Push";
}

function getHandMoneyAtRisk(hand: HandState) {
    const baseRisk = hand.baseBet.isFree ? 0 : hand.baseBet.amount;
    const doubleRisk = hand.doubleType === "paid" ? (hand.doubleAmount ?? hand.baseBet.amount) : 0;
    return baseRisk + doubleRisk;
}

function settleHand(hand: HandState, dealerCards: Card[]) {
    const handTotal = total(hand.cards);
    const dealerTotal = total(dealerCards);
    const dealerBusted = dealerTotal > 21;
    const dealerHas22 = dealerTotal === 22;
    const busted = handTotal > 21;
    const result = getHandOutcomeLabel(handTotal, dealerTotal, dealerHas22, busted, dealerBusted);

    const baseAmount = hand.baseBet.amount;
    const doubleAmount = hand.doubleAmount ?? baseAmount;
    const basePaid = !hand.baseBet.isFree;
    const paidDouble = hand.doubleType === "paid";
    const freeDouble = hand.doubleType === "free";
    const moneyAtRisk = getHandMoneyAtRisk(hand);

    const win =
        !busted && !dealerHas22 && (dealerBusted || handTotal > dealerTotal);
    const push =
        !busted && (dealerHas22 || (!dealerBusted && handTotal === dealerTotal));

    let totalReturn = 0;
    const lines: string[] = [];

    if (busted) {
        lines.push(`Lost ${formatMoney(moneyAtRisk)}.`);
        return { result, settlementText: lines, totalReturn, netProfit: totalReturn - moneyAtRisk };
    }

    if (win) {
        if (basePaid) {
            totalReturn += baseAmount * 2;
            lines.push(`Base bet return: ${formatMoney(baseAmount * 2)}.`);
        } else {
            totalReturn += baseAmount;
            lines.push(`Free split win: ${formatMoney(baseAmount)} profit.`);
        }
        if (paidDouble) {
            totalReturn += doubleAmount * 2;
            lines.push(`Paid double return: ${formatMoney(doubleAmount * 2)}.`);
        }
        if (freeDouble) {
            totalReturn += baseAmount;
            lines.push(`Free double winnings: ${formatMoney(baseAmount)}.`);
        }
        return { result, settlementText: lines, totalReturn, netProfit: totalReturn - moneyAtRisk };
    }

    if (push) {
        if (basePaid) {
            totalReturn += baseAmount;
            lines.push(`Base bet push: ${formatMoney(baseAmount)} returned.`);
        } else {
            lines.push("Free split hand pushes. Free token removed.");
        }
        if (paidDouble) {
            totalReturn += doubleAmount;
            lines.push(`Paid double push: ${formatMoney(doubleAmount)} returned.`);
        }
        if (freeDouble) {
            lines.push("Free double pushes. Free token removed.");
        }
        return { result, settlementText: lines, totalReturn, netProfit: totalReturn - moneyAtRisk };
    }

    lines.push(`Lost ${formatMoney(moneyAtRisk)}.`);
    return { result, settlementText: lines, totalReturn, netProfit: totalReturn - moneyAtRisk };
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function toShared(card: Card, faceUp: boolean): SharedCard {
    return {
        id: card.id,
        suit: card.suit as SharedCard["suit"],
        rank: (card.rank === "10" ? "T" : card.rank) as SharedCard["rank"],
        faceUp,
    };
}

// ─── UI Components ────────────────────────────────────────────────────────────

function Chip({ children }: { children: React.ReactNode }) {
    return (
        <div className="inline-flex rounded-[2px] border border-amber-300/25 bg-black/30 px-3 py-1 text-sm font-bold text-amber-100">
            {children}
        </div>
    );
}

const BADGE: Record<string, string> = {
    Win:       "bg-emerald-500/20 border-emerald-400/40 text-emerald-200",
    Blackjack: "bg-emerald-500/20 border-emerald-400/40 text-emerald-200",
    "Push 22": "bg-amber-500/20  border-amber-400/40  text-amber-200",
    Push:      "bg-amber-500/20  border-amber-400/40  text-amber-200",
    Bust:      "bg-red-500/20    border-red-400/40    text-red-300",
    Lose:      "bg-red-600/20    border-red-500/40    text-red-300",
};

function Badge({ result }: { result: string }) {
    return (
        <span className={`rounded-[2px] border px-2.5 py-0.5 text-sm font-bold ${BADGE[result] ?? ""}`}>
            {result}
        </span>
    );
}

function TableLabel({ onShowRules }: { onShowRules: () => void }) {
    return (
        <div className="flex flex-col items-center gap-1 select-none">
            <div className="flex items-center gap-2">
                <h1
                    className="text-2xl font-bold text-gold-soft"
                >
                    Free Bet Blackjack
                </h1>
                <button
                    onClick={onShowRules}
                    className="flex h-6 w-6 items-center justify-center rounded-[4px] border border-amber-200/35 bg-black/30 text-[11px] font-extrabold text-amber-100 transition hover:border-amber-200/60 hover:bg-amber-200/12 active:scale-95"
                    aria-label="Show Free Bet Blackjack rules"
                >
                    i
                </button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-sm font-semibold text-white/75">
                <span>Blackjack pays 3 to 2</span>
                <span className="text-white/75">·</span>
                <span>Free doubles on 9-10-11</span>
                <span className="text-white/75">·</span>
                <span>Free splits on 2-9 and aces</span>
                <span className="text-white/75">·</span>
                <span>Dealer 22 pushes</span>
            </div>
        </div>
    );
}

function DealerLane({ cards, revealedCount, stage }: {
    cards: Card[]; revealedCount: number; stage: Stage;
}) {
    const revealed = stage === "dealer" || stage === "done";
    const t = cards.length ? total(cards) : null;
    return (
        <div className="flex flex-col items-center gap-2">
            <Chip>Dealer{revealed && t !== null ? ` · ${t}${isSoft(cards) ? " soft" : ""}` : ""}</Chip>
            <div className="relative w-[248px] sm:w-[288px]">
                {cards.length === 0 && (
                    <div className="absolute inset-0 flex justify-center gap-[6px]">
                        {[0, 1].map((i) => (
                            <div key={i} className={`${CARD_CLS} border border-dashed border-white/15 bg-white/5`} />
                        ))}
                    </div>
                )}
                <HandRow
                    cards={cards.map((card) => toShared(card, true))}
                    isFaceUp={(id) => cards.findIndex((card) => card.id === id) < revealedCount}
                    size="md"
                    slots={4}
                    dealDelay={() => 0}
                />
            </div>
        </div>
    );
}

function HandBox({ hand, index, isActive, stage, dealerTotal }: {
    hand: HandState; index: number; isActive: boolean; stage: Stage; dealerTotal: number;
}) {
    const t = total(hand.cards);
    const bust = t > 21;
    const result = hand.result !== "" ? hand.result : null;
    const betTag = hand.baseBet.isFree ? "Free" : "Paid";
    const doubleSuffix =
        hand.doubleType === "free" ? " + Free ×2" :
        hand.doubleType === "paid"
            ? (hand.doubleAmount !== undefined && hand.doubleAmount < hand.baseBet.amount ? ` + ${formatMoney(hand.doubleAmount)} double` : " + Paid ×2")
            : "";

    void dealerTotal;
    void stage;

    return (
        // compact, so a dealt hand takes little more room than the bet circles it replaces: the
        // total and the bet share one line
        <div className={`flex flex-col items-center gap-1 rounded-[4px] border p-2 transition-colors duration-300
            ${isActive ? "border-amber-300/50 bg-amber-300/[0.08] ring-2 ring-amber-300/20" : "border-white/10 bg-black/15"}`}
        >
            <div className="flex items-center gap-2">
                <Chip>Hand {index + 1}</Chip>
                {result && <Badge result={result} />}
            </div>
            <BlackjackHand cards={hand.cards.map((card) => ({ ...toShared(card, true), sideways: card.sideways }))} />
            <div className="flex flex-wrap items-baseline justify-center gap-x-2 text-center">
                <span className="text-sm font-bold text-amber-100">{t}{isSoft(hand.cards) ? " soft" : ""}{bust ? " · Bust" : ""}</span>
                <span className="text-xs text-white/75">{betTag} {formatMoney(hand.baseBet.amount)}{doubleSuffix}</span>
            </div>
        </div>
    );
}

function PayoutColumn({ title, entries, highlight }: {
    title: string; entries: Record<string, number>; highlight?: string | null;
}) {
    return (
        <div className="flex flex-col gap-1 pt-2">
            <div className="mb-1 text-center text-[12px] font-extrabold text-amber-200">
                {title}
            </div>
            {Object.entries(entries)
                .sort((a, b) => b[1] - a[1])
                .map(([label, mult]) => {
                    const isHit = highlight === label;
                    return (
                        <div
                            key={label}
                            className={`flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[13px] transition ${isHit ? "bg-amber-300/[0.12]" : ""}`}
                        >
                            <span className={isHit ? "font-extrabold text-amber-100" : "text-white/75"}>{label}</span>
                            <span className={`shrink-0 font-bold text-gold`}>{mult} to 1</span>
                        </div>
                    );
                })}
        </div>
    );
}

// ─── Rules modal ──────────────────────────────────────────────────────────────

function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    if (!open) return null;

    const sections = [
        {
            title: "How the Hand Starts",
            items: [
                "• Place a main bet, then optionally add Push 22 and Pot of Gold side bets.",
                "• You and the dealer each get 2 cards. The dealer starts with 1 card hidden.",
                "• Blackjack pays 3 to 2, unless the dealer also has blackjack.",
            ],
        },
        {
            title: "Free Doubles",
            items: [
                "• Hard 9, 10, and 11 qualify for a free double.",
                "• A free double adds a second wager for free, so only the winnings are paid if it wins.",
                "• Other doubles are paid doubles and add another main bet at risk.",
            ],
        },
        {
            title: "Free Splits",
            items: [
                "• Pairs of 2 through 9 and Aces qualify for free splits.",
                "• A free split creates another hand without charging another main bet.",
                "• Tens and face cards can still split, but they are paid splits.",
            ],
        },
        {
            title: "Push 22 and Pot of Gold",
            items: [
                "• If the dealer finishes on exactly 22, all standing main hands push instead of losing or winning.",
                "• Push 22 wins when the dealer finishes on exactly 22 and pays 11 to 1.",
                "• Pot of Gold pays based on how many free bet tokens you earn in the round.",
            ],
        },
    ];

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <button
                    className="absolute inset-0 bg-black/72"
                    onClick={onClose}
                    aria-label="Close rules modal"
                />
                <motion.div
                    initial={{ opacity: 0, y: 24, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 16, scale: 0.98 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="relative z-[101] max-h-[88dvh] w-full max-w-[820px] overflow-hidden rounded-[4px] border border-[#a35c5c] bg-[#300b0b] text-white"
                >
                    <div className="flex items-center justify-between border-b border-[#a35c5c] px-4 py-3 sm:px-5 sm:py-4">
                        <div>
                            <div className="text-[13px] font-extrabold text-amber-200/90">
                                Game Info
                            </div>
                            <div className="mt-1 text-xl font-bold tracking-[-0.01em] text-gold-soft">
                                Free Bet Blackjack Rules
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-[#a35c5c] bg-[#4f1212] text-xl font-bold text-text transition-colors hover:bg-[#661717] active:bg-[#300b0b]"
                            aria-label="Close rules modal"
                        >
                            ×
                        </button>
                    </div>

                    <div className="max-h-[calc(88dvh-76px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                        <div className="grid gap-3 text-sm leading-6 text-amber-50 sm:grid-cols-2">
                            {sections.map((section) => (
                                <div key={section.title} className="rounded-[4px] border border-[#a35c5c] bg-[#4f1212] p-4">
                                    <div className="mb-2 text-sm font-extrabold text-amber-200">
                                        {section.title}
                                    </div>
                                    <div className="space-y-1">
                                        {section.items.map((item) => (
                                            <div key={item}>{item}</div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-3 rounded-[4px] border border-amber-200/15 bg-amber-200/[0.06] p-4 text-sm leading-6 text-amber-50/90">
                            The big twist: qualifying doubles and splits can be made for free. You only risk the paid money you actually put on the table, but free double and free split wins can still add profit. Dealer 22 is the catch because it pushes standing main hands.
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

function FreeBetBar({
    stage, isShuffling, bet, buyIn, bankroll,
    canDouble, doubleForLess, canSplit, isFreeDouble, isFreeSplitAction, isResolvingAction,
    canDealFromDone,
    selectedChip, onChipSelect,
    onClear, onReset, onChangeBet, onDeal, onHit, onStay, onDouble, onSplit,
}: {
    stage: Stage; isShuffling: boolean; bet: number; buyIn: number; bankroll: number;
    canDouble: boolean; doubleForLess: boolean; canSplit: boolean; isFreeDouble: boolean; isFreeSplitAction: boolean;
    isResolvingAction: boolean;
    canDealFromDone: boolean;
    selectedChip: ChipDenomination; onChipSelect: (c: ChipDenomination) => void;
    onClear: () => void; onReset: () => void; onChangeBet: () => void; onDeal: () => void; onHit: () => void; onStay: () => void;
    onDouble: () => void; onSplit: () => void;
}) {
    const isBetting = stage === "betting";
    const isDone    = stage === "done";
    const isPlayer  = stage === "player";
    const isDealer  = stage === "dealer";
    const isDealing = stage === "dealing";

    const canClear = isBetting;
    const canDeal  = isBetting && !isShuffling && bet >= MIN_BET && bankroll >= buyIn;

    return (
        <div className="flex flex-col gap-2 border-t border-line bg-ink px-4 py-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3">

            {/* Left: chip tray */}
            {/* the tray stays through the dealer's turn too, so the bar keeps one height */}
            <div className="flex items-center">
                <ChipTray
                    selectedChip={selectedChip}
                    onSelect={onChipSelect}
                    disabled={isPlayer || isDealer || isDone || isShuffling}
                />
            </div>

            {/* Center: stage buttons */}
            <div className="flex items-center justify-center gap-2">
                <AnimatePresence mode="popLayout" initial={false}>

                    {canClear && (
                        <SlideBtn key="clear">
                            <button data-hotkey="Q" className={BTN_NEUTRAL} onClick={onClear} disabled={isShuffling || buyIn <= 0}>Clear</button>
                        </SlideBtn>
                    )}
                    {isBetting && (
                        <SlideBtn key="reset">
                            <button data-hotkey="E" className={BTN_NEUTRAL} onClick={onReset}>Reset</button>
                        </SlideBtn>
                    )}

                    {isPlayer && (
                        <SlideBtn key="stay">
                            <button data-hotkey="G" data-hotkey-alt="S Space" className={BTN_NEUTRAL} onClick={onStay} disabled={isResolvingAction}>Stay</button>
                        </SlideBtn>
                    )}

                    {isPlayer && (
                        <SlideBtn key="hit">
                            <button data-hotkey="H" className={BTN_NEUTRAL} onClick={onHit} disabled={isResolvingAction}>Hit</button>
                        </SlideBtn>
                    )}

                    {isPlayer && (
                        <SlideBtn key="double">
                            <button data-hotkey="B"
                                className={isFreeDouble ? BTN_GREEN : BTN_GOLD}
                                onClick={onDouble}
                                disabled={!canDouble || isResolvingAction}
                            >
                                {isFreeDouble ? "Free Double" : doubleForLess ? "Double for Less" : "Double"}
                            </button>
                        </SlideBtn>
                    )}

                    {isPlayer && (
                        <SlideBtn key="split">
                            <button data-hotkey="P"
                                className={isFreeSplitAction ? BTN_GREEN : BTN_GOLD}
                                onClick={onSplit}
                                disabled={!canSplit || isResolvingAction}
                            >
                                {isFreeSplitAction ? "Free Split" : "Split"}
                            </button>
                        </SlideBtn>
                    )}

                    {isDealing && (
                        <motion.span
                            key="dealing-msg"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-sm italic text-white/75"
                        >
                            Dealing…
                        </motion.span>
                    )}

                    {isDealer && (
                        <motion.span
                            key="dealer-msg"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-sm italic text-white/75"
                        >
                            Dealer playing…
                        </motion.span>
                    )}

                    {isDone && (
                        <SlideBtn key="clear-done">
                            <button data-hotkey="Q" className={BTN_NEUTRAL} onClick={onClear}>Clear</button>
                        </SlideBtn>
                    )}

                    {isDone && (
                        <SlideBtn key="change-bet">
                            <button data-hotkey="B" className={BTN_NEUTRAL} onClick={onChangeBet}>Change Bet</button>
                        </SlideBtn>
                    )}

                    {isBetting && (
                        <SlideBtn key="deal">
                            <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={onDeal} disabled={!canDeal}>Deal</button>
                        </SlideBtn>
                    )}

                    {isDone && (
                        <SlideBtn key="rebet-deal">
                            <button data-hotkey="Space" data-hotkey-alt="Enter" className={BTN_GOLD} onClick={onDeal} disabled={!canDealFromDone}>Rebet &amp; Deal</button>
                        </SlideBtn>
                    )}

                </AnimatePresence>
            </div>

            {/* Right: invisible mirror for true centering */}
            <div className="invisible hidden sm:block">
                <ChipTray selectedChip={selectedChip} onSelect={() => { }} disabled />
            </div>

        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FreeBetBlackjack({ bankroll, setBankroll }: Props) {
    const recordBet = useBetRecorder();
    // two shoes take turns, gold backs then purple: a reshuffle brings out the other one
    const [deckNo, setDeckNo] = useState(1);

    // ── Game state (preserved) ────────────────────────────────────────────────

    const [deck, setDeck] = useState<Card[]>(() => createShoe());
    const [dealer, setDealer] = useState<Card[]>([]);
    const [hands, setHands] = useState<HandState[]>([]);
    const [active, setActive] = useState(0);
    const [dealerRevealedCount, setDealerRevealedCount] = useState(1);
    const [bet, setBet] = useState<number>(() => defaultBet("freebetblackjack", "main"));
    const [push22Bet, setPush22Bet] = useState<number>(() => defaultBet("freebetblackjack", "push22"));
    const [potOfGoldBet, setPotOfGoldBet] = useState<number>(() => defaultBet("freebetblackjack", "potOfGold"));
    const [stage, setStage] = useState<Stage>("betting");
    const [message, setMessage] = useState("Set your bets and press Deal.");
    const [isShuffling, setIsShuffling] = useState(false);
    const [freeBetTokens, setFreeBetTokens] = useState(0);
    const [roundBreakdown, setRoundBreakdown] = useState<RoundBreakdown>({
        totalReturned: 0, totalNet: 0, lines: [], sideBets: [],
    });
    const [sideBetSnapshot, setSideBetSnapshot] = useState<SideBetSnapshot>({ push22: 0, potOfGold: 0 });

    // ── UI state ──────────────────────────────────────────────────────────────

    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(25);

    // Deal runs one at a time, so a double-click cannot take the bet twice. The lock is held
    // a moment longer so a hand that ends instantly is not dealt over by the second click.
    const dealLock = useRef(false);
    const dealOnce = async () => {
        if (dealLock.current) return;
        dealLock.current = true;
        try { await deal(); } finally { window.setTimeout(() => { dealLock.current = false; }, 300); }
    };
    const [chipStack, setChipStack] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("freebetblackjack", "main")));
    const [push22Stack, setPush22Stack] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("freebetblackjack", "push22")));
    const [potOfGoldStack, setPotOfGoldStack] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("freebetblackjack", "potOfGold")));
    const [selectedZone, setSelectedZone] = useState<"push22" | "potOfGold" | null>(null);
    const [isResolvingAction, setIsResolvingAction] = useState(false);
    const [showRules, setShowRules] = useState(false);

    // ── localStorage effects (preserved) ─────────────────────────────────────

    useEffect(() => {
        window.localStorage.setItem(BET_STORAGE_KEY, String(clampMainBet(bet)));
    }, [bet]);

    useEffect(() => {
        window.localStorage.setItem(PUSH22_STORAGE_KEY, String(clampSideBet(push22Bet)));
    }, [push22Bet]);

    useEffect(() => {
        window.localStorage.setItem(POT_OF_GOLD_STORAGE_KEY, String(clampSideBet(potOfGoldBet)));
    }, [potOfGoldBet]);

    // ── Derived values (preserved) ────────────────────────────────────────────

    const activeHand = hands[active];

    const liveMoneyOnFelt = useMemo(() => {
        return hands.reduce((sum, hand) => sum + getHandMoneyAtRisk(hand), 0);
    }, [hands]);

    void liveMoneyOnFelt;

    const totalBuyIn = useMemo(() => {
        if (stage === "betting") {
            return clampMainBet(bet) + clampSideBet(push22Bet) + clampSideBet(potOfGoldBet);
        }
        const activeSideBets = sideBetSnapshot.push22 + sideBetSnapshot.potOfGold;
        return hands.reduce((sum, hand) => sum + getHandMoneyAtRisk(hand), 0) + activeSideBets;
    }, [bet, push22Bet, potOfGoldBet, stage, hands, sideBetSnapshot]);

    const showFinalNet = stage === "done" && hands.some((h) => h.result !== "");

    // BetBar display: raw chip amount + side bets during betting; totalBuyIn after deal
    const displayBet = useMemo(() => {
        if (stage === "betting") {
            return bet > 0 ? bet + clampSideBet(push22Bet) + clampSideBet(potOfGoldBet) : 0;
        }
        return totalBuyIn;
    }, [stage, bet, push22Bet, potOfGoldBet, totalBuyIn]);

    // ── Game handlers (preserved) ─────────────────────────────────────────────

    const performShuffleIfNeeded = async (shoe: Card[]) => {
        if (!shouldShuffle(shoe)) return shoe;
        setIsShuffling(true);
        setDeckNo((n) => n + 1);
        setMessage("Shuffling 6-deck shoe...");
        await wait(SHUFFLE_DELAY_MS);
        const freshShoe = createShoe();
        setDeck(freshShoe);
        setIsShuffling(false);
        return freshShoe;
    };

    const settleSideBets = (dealerCards: Card[], tokenCount: number, snapshot: SideBetSnapshot) => {
        const dealerTotal = total(dealerCards);
        let totalReturn = 0;
        const lines: string[] = [];
        const sideBets: SideBetBreakdown[] = [];

        if (snapshot.push22 > 0) {
            if (dealerTotal === 22) {
                const returned = snapshot.push22 * 12;
                const netProfit = returned - snapshot.push22;
                totalReturn += returned;
                lines.push(`Push 22 return: ${formatMoney(returned)}.`);
                sideBets.push({
                    name: "Push 22", wager: snapshot.push22, totalReturn: returned, netProfit,
                    detail: `Dealer made 22. ${formatMoney(snapshot.push22)} bet paid 11 to 1 and returned ${formatMoney(returned)} total.`,
                    resultText: "Win 11 to 1",
                });
            } else {
                lines.push(`Push 22 lost ${formatMoney(snapshot.push22)}.`);
                sideBets.push({
                    name: "Push 22", wager: snapshot.push22, totalReturn: 0, netProfit: -snapshot.push22,
                    detail: `Dealer finished on ${dealerTotal}, so the side bet lost.`,
                    resultText: "Lose",
                });
            }
        }

        if (snapshot.potOfGold > 0) {
            const multiplier = potOfGoldMultiplier(tokenCount);
            if (multiplier > 0) {
                const returned = snapshot.potOfGold * (multiplier + 1);
                const netProfit = returned - snapshot.potOfGold;
                totalReturn += returned;
                lines.push(`Pot of Gold return: ${formatMoney(returned)} with ${tokenCount} token${tokenCount === 1 ? "" : "s"}.`);
                sideBets.push({
                    name: "Pot of Gold", wager: snapshot.potOfGold, totalReturn: returned, netProfit,
                    detail: `${tokenCount} token${tokenCount === 1 ? "" : "s"} earned ${multiplier} to 1, returning ${formatMoney(returned)} total.`,
                    resultText: `Win ${multiplier} to 1`,
                });
            } else {
                lines.push(`Pot of Gold lost ${formatMoney(snapshot.potOfGold)} with ${tokenCount} tokens.`);
                sideBets.push({
                    name: "Pot of Gold", wager: snapshot.potOfGold, totalReturn: 0, netProfit: -snapshot.potOfGold,
                    detail: `${tokenCount} token${tokenCount === 1 ? "" : "s"} did not qualify for a payout.`,
                    resultText: "Lose",
                });
            }
        }

        return { totalReturn, netProfit: totalReturn - snapshot.push22 - snapshot.potOfGold, lines, sideBets };
    };

    const applyRoundBreakdown = (
        settledHands: HandState[],
        dealerCards: Card[],
        tokenCount: number,
        snapshot: SideBetSnapshot
    ) => {
        const handLines: string[] = [];
        let handsReturn = 0;
        let handsRisk = 0;

        settledHands.forEach((hand, index) => {
            handsReturn += hand.totalReturn;
            handsRisk += getHandMoneyAtRisk(hand);
            handLines.push(`Hand ${index + 1}: ${hand.result}.`);
            hand.settlementText.forEach((line) => handLines.push(`  ${line}`));
            handLines.push(`  Total returned: ${formatMoney(hand.totalReturn)}.`);
            handLines.push(`  Net: ${hand.netProfit >= 0 ? "+" : ""}${formatMoney(hand.netProfit)}.`);
        });

        const side = settleSideBets(dealerCards, tokenCount, snapshot);
        // each hand and each side bet on its own, for the yearly stats
        settledHands.forEach((hand) => recordBet("Hand", getHandMoneyAtRisk(hand), hand.totalReturn, hand.result));
        side.sideBets.forEach((bet) => recordBet(bet.name, bet.wager, bet.totalReturn, bet.resultText));
        const totalReturned = handsReturn + side.totalReturn;
        const totalRisk = handsRisk + snapshot.push22 + snapshot.potOfGold;
        const totalNet = totalReturned - totalRisk;

        setRoundBreakdown({
            totalReturned, totalNet,
            lines: [
                ...handLines, ...side.lines,
                `Round total returned: ${formatMoney(totalReturned)}.`,
                `Round net: ${totalNet >= 0 ? "+" : ""}${formatMoney(totalNet)}.`,
            ],
            sideBets: side.sideBets,
        });

        if (totalReturned > 0) setBankroll((b) => b + totalReturned);
    };

    const finishRoundWithoutDealer = async (finalHands: HandState[], snapshot: SideBetSnapshot) => {
        const allBusted = finalHands.length > 0 && finalHands.every((hand) => total(hand.cards) > 21);
        if (allBusted) setMessage("All hands bust. Dealer reveals hole card.");
        else setMessage("Round complete.");

        if (dealer.length > 0) { setDealerRevealedCount(dealer.length); await wait(650); }

        const finalized = finalHands.map((hand) => {
            const settled = settleHand({ ...hand, result: "Bust" }, dealer);
            return { ...hand, result: settled.result, settlementText: settled.settlementText, totalReturn: settled.totalReturn, netProfit: settled.netProfit };
        });

        setHands(finalized);
        applyRoundBreakdown(finalized, dealer, freeBetTokens, snapshot);
        setStage("done");
        setMessage(allBusted ? "All hands bust. Dealer does not draw." : "Round complete.");
    };

    const dealerTurn = async (
        handsInPlay: HandState[] = hands,
        shoeInPlay: Card[] = deck,
        tokenCount = freeBetTokens,
        snapshot: SideBetSnapshot
    ) => {
        const liveHands = handsInPlay.filter((hand) => total(hand.cards) <= 21);
        if (liveHands.length === 0) { await finishRoundWithoutDealer(handsInPlay, snapshot); return; }

        let nextDealer = [...dealer];
        let nextDeck = [...shoeInPlay];
        let revealedCount = 1;

        setStage("dealer"); setMessage("Dealer reveals hole card."); setDealerRevealedCount(2); revealedCount = 2;
        await wait(DEALER_CARD_MS);

        // dealer hit cards come out face up, one at a time
        while (total(nextDealer) < 17 || (total(nextDealer) === 17 && isSoft(nextDealer))) {
            const card = nextDeck.shift();
            if (!card) break;
            nextDealer.push(card);
            revealedCount = nextDealer.length;
            setDealer([...nextDealer]); setDeck([...nextDeck]); setDealerRevealedCount(revealedCount);
            setMessage("Dealer draws.");
            await wait(DEALER_CARD_MS);
        }

        const settledHands = handsInPlay.map((hand) => {
            const settled = settleHand(hand, nextDealer);
            return { ...hand, result: settled.result, settlementText: settled.settlementText, totalReturn: settled.totalReturn, netProfit: settled.netProfit };
        });

        setDeck(nextDeck); setDealer(nextDealer); setDealerRevealedCount(nextDealer.length);
        setHands(settledHands);
        applyRoundBreakdown(settledHands, nextDealer, tokenCount, snapshot);

        const dealerTotal = total(nextDealer);
        setStage("done");
        setMessage(
            dealerTotal === 22 ? "Dealer makes 22. All live hands push." :
            dealerTotal > 21   ? "Dealer busts." : "Round complete."
        );
    };

    const ensureHandHasSecondCard = async (handsInPlay: HandState[], handIndex: number, shoeInPlay: Card[]) => {
        const targetHand = handsInPlay[handIndex];
        if (!targetHand || targetHand.cards.length !== 1) return { hands: handsInPlay, deck: shoeInPlay };
        const nextDeck = [...shoeInPlay];
        const drawnCard = nextDeck.shift();
        if (!drawnCard) return { hands: handsInPlay, deck: shoeInPlay };
        const nextHands = [...handsInPlay];
        nextHands[handIndex] = { ...nextHands[handIndex], cards: [...nextHands[handIndex].cards, drawnCard] };
        setHands(nextHands); setDeck(nextDeck);
        await wait(250);
        return { hands: nextHands, deck: nextDeck };
    };

    const moveToNextHand = async (
        nextHands: HandState[],
        nextDeck: Card[],
        tokenCount = freeBetTokens,
        currentActive = active,
        snapshot: SideBetSnapshot,
        // how long to hold on the player's hand before the dealer plays
        pauseMs = PLAYER_TO_DEALER_DELAY_MS,
    ) => {
        const nextIndex = currentActive + 1;

        if (nextIndex < nextHands.length) {
            setActive(nextIndex);
            setMessage(`Playing hand ${nextIndex + 1} of ${nextHands.length}.`);
            const dealt = await ensureHandHasSecondCard(nextHands, nextIndex, nextDeck);
            const nextHand = dealt.hands[nextIndex];
            const nextTotal = total(nextHand.cards);

            if (nextTotal === 21) {
                setMessage(`Hand ${nextIndex + 1} makes 21.`);
                await waitForPaint();
                await wait(PLAYER_TO_DEALER_DELAY_MS);
                await moveToNextHand(dealt.hands, dealt.deck, tokenCount, nextIndex, snapshot);
                return;
            }
            if (nextTotal > 21) {
                const bustedHands = [...dealt.hands];
                bustedHands[nextIndex] = { ...bustedHands[nextIndex], result: "Bust" };
                setHands(bustedHands); setMessage(`Hand ${nextIndex + 1} busts.`);
                await waitForPaint();
                await wait(PLAYER_TO_DEALER_DELAY_MS);
                await moveToNextHand(bustedHands, dealt.deck, tokenCount, nextIndex, snapshot);
                return;
            }
            return;
        }

        if (nextHands.some((hand) => total(hand.cards) <= 21)) {
            await waitForPaint();
            await wait(pauseMs);
            await dealerTurn(nextHands, nextDeck, tokenCount, snapshot);
            return;
        }
        await waitForPaint();
        await wait(PLAYER_TO_DEALER_DELAY_MS);
        await finishRoundWithoutDealer(nextHands, snapshot);
    };

    const split = async () => {
        if (!activeHand) return;
        if (hands.length >= MAX_HANDS) return;
        if (activeHand.cards.length !== 2) return;
        if (!canSplitRanks(activeHand.cards)) return;

        const freeSpl = isFreeSplit(activeHand.cards);
        const splitCost = freeSpl ? 0 : activeHand.baseBet.amount;
        if (bankroll < splitCost) return;
        if (splitCost > 0) setBankroll((b) => b - splitCost);

        const firstCard = activeHand.cards[0];
        const secondCard = activeHand.cards[1];

        const firstHand: HandState = {
            cards: [firstCard], baseBet: { ...activeHand.baseBet }, doubleType: "none",
            splitDepth: activeHand.splitDepth + 1, result: "", settlementText: [], totalReturn: 0, netProfit: 0,
        };
        const secondHand: HandState = {
            cards: [secondCard], baseBet: { amount: activeHand.baseBet.amount, isFree: freeSpl },
            doubleType: "none", splitDepth: activeHand.splitDepth + 1, result: "", settlementText: [], totalReturn: 0, netProfit: 0,
        };

        const nextHands = [...hands.slice(0, active), firstHand, secondHand, ...hands.slice(active + 1)];
        const nextTokenCount = freeSpl ? freeBetTokens + 1 : freeBetTokens;

        setHands(nextHands); setFreeBetTokens(nextTokenCount);
        setMessage(freeSpl ? `Free split on hand ${active + 1}.` : `Paid split on hand ${active + 1}.`);

        const dealt = await ensureHandHasSecondCard(nextHands, active, deck);
        const activeTotal = total(dealt.hands[active].cards);

        if (activeTotal === 21) {
            setMessage(`Hand ${active + 1} makes 21.`);
            await waitForPaint();
            await wait(PLAYER_TO_DEALER_DELAY_MS);
            await moveToNextHand(dealt.hands, dealt.deck, nextTokenCount, active, sideBetSnapshot);
            return;
        }
        if (activeTotal > 21) {
            const bustedHands = [...dealt.hands];
            bustedHands[active] = { ...bustedHands[active], result: "Bust" };
            setHands(bustedHands); setMessage(`Hand ${active + 1} busts.`);
            await waitForPaint();
            await wait(PLAYER_TO_DEALER_DELAY_MS);
            await moveToNextHand(bustedHands, dealt.deck, nextTokenCount, active, sideBetSnapshot);
        }
    };

    const deal = async () => {
        if (isShuffling) return;

        const wager = clampMainBet(bet);
        const clampedPush22 = clampSideBet(push22Bet);
        const clampedPotOfGold = clampSideBet(potOfGoldBet);
        const buyIn = wager + clampedPush22 + clampedPotOfGold;

        if (bankroll < buyIn) { setMessage("Not enough bankroll for those bets."); return; }

        let nextDeck = [...deck];
        nextDeck = await performShuffleIfNeeded(nextDeck);
        if (nextDeck.length < 4) nextDeck = await performShuffleIfNeeded([]);

        const snapshot: SideBetSnapshot = { push22: clampedPush22, potOfGold: clampedPotOfGold };
        setSideBetSnapshot(snapshot);
        setBankroll((b) => b - buyIn);

        const playerHand = [nextDeck[0], nextDeck[1]];
        const dealerHand = [nextDeck[2], nextDeck[3]];
        nextDeck = nextDeck.slice(4);

        const openingHand: HandState = {
            cards: playerHand, baseBet: { amount: wager, isFree: false }, doubleType: "none",
            splitDepth: 0, result: "", settlementText: [], totalReturn: 0, netProfit: 0,
        };

        setDeck(nextDeck); setDealerRevealedCount(1);
        setActive(0); setFreeBetTokens(0);
        setRoundBreakdown({ totalReturned: 0, totalNet: 0, lines: [], sideBets: [] });

        // player, dealer, player, dealer. The dealer's second card stays face down.
        setStage("dealing");
        setMessage("Dealing...");
        setDealer([]); setHands([{ ...openingHand, cards: [playerHand[0]] }]);
        await wait(DEAL_CARD_MS);
        setDealer([dealerHand[0]]);
        await wait(DEAL_CARD_MS);
        setHands([openingHand]);
        await wait(DEAL_CARD_MS);
        setDealer(dealerHand);
        await wait(DEAL_CARD_MS);

        const dealerBJ = isBlackjack(dealerHand);
        const playerBJ = isBlackjack(playerHand);

        if (dealerBJ) {
            setDealerRevealedCount(2);
            let settledHand: HandState;
            if (playerBJ) {
                settledHand = { ...openingHand, result: "Push", settlementText: [`Blackjack push: ${formatMoney(wager)} returned.`], totalReturn: wager, netProfit: 0 };
                setMessage("Both player and dealer have blackjack. Push.");
            } else {
                settledHand = { ...openingHand, result: "Lose", settlementText: [`Lost ${formatMoney(wager)}.`], totalReturn: 0, netProfit: -wager };
                setMessage("Dealer blackjack. Hand over.");
            }
            setHands([settledHand]);
            applyRoundBreakdown([settledHand], dealerHand, 0, snapshot);
            setStage("done"); return;
        }

        if (playerBJ) {
            setDealerRevealedCount(2);
            const settledHand: HandState = {
                ...openingHand, result: "Blackjack",
                settlementText: [`Blackjack return: ${formatMoney(wager * 2.5)}.`],
                totalReturn: wager * 2.5, netProfit: wager * 1.5,
            };
            setHands([settledHand]);
            applyRoundBreakdown([settledHand], dealerHand, 0, snapshot);
            setStage("done"); setMessage("Blackjack pays 3 to 2."); return;
        }

        setStage("player");
        setMessage("Hit, stay, double, or split.");
    };

    const hit = async () => {
        if (!activeHand) return;
        const nextDeck = [...deck];
        const card = nextDeck.shift();
        if (!card) return;
        const nextHands = [...hands];
        nextHands[active] = { ...nextHands[active], cards: [...nextHands[active].cards, card] };
        setDeck(nextDeck); setHands(nextHands);
        const handTotal = total(nextHands[active].cards);
        if (handTotal === 21) {
            setMessage(`Hand ${active + 1} makes 21.`);
            await waitForPaint();
            await wait(PLAYER_TO_DEALER_DELAY_MS);
            await moveToNextHand(nextHands, nextDeck, freeBetTokens, active, sideBetSnapshot);
            return;
        }
        if (handTotal > 21) {
            const bustedHands = [...nextHands];
            bustedHands[active] = { ...bustedHands[active], result: "Bust" };
            setHands(bustedHands); setMessage(`Hand ${active + 1} busts.`);
            await waitForPaint();
            await wait(PLAYER_TO_DEALER_DELAY_MS);
            await moveToNextHand(bustedHands, nextDeck, freeBetTokens, active, sideBetSnapshot);
        }
    };

    const stay = async () => {
        await moveToNextHand(hands, deck, freeBetTokens, active, sideBetSnapshot, STAND_TO_DEALER_DELAY_MS);
    };

    const doubleDown = async () => {
        if (!activeHand) return;
        if (activeHand.cards.length !== 2) return;
        const freeDouble = isHardFreeDouble(activeHand.cards);
        // a paid double costs the bet again, or the rest of the balance if that is less
        const cost = freeDouble ? 0 : Math.min(activeHand.baseBet.amount, bankroll);
        if (!freeDouble && cost <= 0) return;
        if (cost > 0) setBankroll((b) => b - cost);

        const nextTokenCount = freeDouble ? freeBetTokens + 1 : freeBetTokens;
        const nextHands = [...hands];
        nextHands[active] = { ...nextHands[active], doubleType: freeDouble ? "free" : "paid", doubleAmount: freeDouble ? undefined : cost };
        const nextDeck = [...deck];
        const drawn = nextDeck.shift();
        if (!drawn) return;
        const card: Card = { ...drawn, sideways: true };
        nextHands[active] = { ...nextHands[active], cards: [...nextHands[active].cards, card] };
        setHands(nextHands); setDeck(nextDeck); setFreeBetTokens(nextTokenCount);

        if (total(nextHands[active].cards) > 21) {
            nextHands[active] = { ...nextHands[active], result: "Bust" };
            setHands([...nextHands]);
            setMessage(freeDouble ? `Hand ${active + 1} busts after free double.` : `Hand ${active + 1} busts after doubling.`);
        }
        await waitForPaint();
        await wait(PLAYER_TO_DEALER_DELAY_MS);
        await moveToNextHand(nextHands, nextDeck, nextTokenCount, active, sideBetSnapshot);
    };

    // ── Derived action flags (preserved) ─────────────────────────────────────

    const canSplit =
        stage === "player" && !!activeHand && activeHand.cards.length === 2 &&
        hands.length < MAX_HANDS && canSplitRanks(activeHand.cards) &&
        (isFreeSplit(activeHand.cards) || bankroll >= activeHand.baseBet.amount);

    const canDouble =
        stage === "player" && !!activeHand && activeHand.cards.length === 2 &&
        (isHardFreeDouble(activeHand.cards) || bankroll > 0);
    const doubleForLess = canDouble && !!activeHand && !isHardFreeDouble(activeHand.cards) && bankroll < activeHand.baseBet.amount;

    // ── UI handlers ───────────────────────────────────────────────────────────

    const handleChipSelect = (chip: ChipDenomination) => {
        setSelectedChip(chip);
        if (stage === "betting") {
            if (selectedZone === "push22") {
                if (push22Bet + chip <= SIDE_MAX) {
                    setPush22Bet((b) => Math.min(SIDE_MAX, b + chip));
                    setPush22Stack((s) => addChipToStack(s, chip));
                }
            } else if (selectedZone === "potOfGold") {
                if (potOfGoldBet + chip <= SIDE_MAX) {
                    setPotOfGoldBet((b) => Math.min(SIDE_MAX, b + chip));
                    setPotOfGoldStack((s) => addChipToStack(s, chip));
                }
            } else {
                setBet((b) => b + chip);
                setChipStack((s) => addChipToStack(s, chip));
            }
        }
    };

    // Clicking the chips on a spot takes the last chip back
    const removeLastChip = (zone: "push22" | "potOfGold" | null) => {
        if (stage !== "betting") return;
        if (zone === "push22") {
            const next = popLastChip(push22Bet);
            setPush22Bet(next); setPush22Stack(buildChipStackFromAmount(next));
        } else if (zone === "potOfGold") {
            const next = popLastChip(potOfGoldBet);
            setPotOfGoldBet(next); setPotOfGoldStack(buildChipStackFromAmount(next));
        } else {
            const next = popLastChip(bet);
            setBet(next); setChipStack(buildChipStackFromAmount(next));
        }
    };

    const clearAll = () => {
        setBet(0); setChipStack([]);
        setPush22Bet(0); setPush22Stack([]);
        setPotOfGoldBet(0); setPotOfGoldStack([]);
        setDealer([]); setHands([]); setActive(0); setDealerRevealedCount(1);
        setStage("betting"); setFreeBetTokens(0);
        setRoundBreakdown({ totalReturned: 0, totalNet: 0, lines: [], sideBets: [] });
        setMessage(shouldShuffle(deck) ? "Cut card reached. Next hand will shuffle the shoe." : "Set your bets and press Deal.");
        setSelectedZone(null);
    };

    // Reset: back to the bets saved in Settings
    const resetBets = () => {
        if (stage !== "betting") return;
        const main = defaultBet("freebetblackjack", "main");
        const push22 = defaultBet("freebetblackjack", "push22");
        const potOfGold = defaultBet("freebetblackjack", "potOfGold");
        setBet(main); setChipStack(buildChipStackFromAmount(main));
        setPush22Bet(push22); setPush22Stack(buildChipStackFromAmount(push22));
        setPotOfGoldBet(potOfGold); setPotOfGoldStack(buildChipStackFromAmount(potOfGold));
    };

    const changeBet = () => {
        setDealer([]); setHands([]); setActive(0); setDealerRevealedCount(1);
        setStage("betting"); setFreeBetTokens(0);
        setRoundBreakdown({ totalReturned: 0, totalNet: 0, lines: [], sideBets: [] });
        setMessage(shouldShuffle(deck) ? "Cut card reached. Next hand will shuffle the shoe." : "Set your bets and press Deal.");
        setSelectedZone(null);
    };

    const runAction = async (fn: () => Promise<void>) => {
        if (isResolvingAction) return;
        setIsResolvingAction(true);
        try { await fn(); } finally { setIsResolvingAction(false); }
    };

    // ── Payout column data ────────────────────────────────────────────────────

    const push22Entries: Record<string, number> = { "Dealer 22": 11 };
    const potOfGoldEntries: Record<string, number> = {
        "7+ tokens": 1000, "6 tokens": 300, "5 tokens": 100,
        "4 tokens": 60, "3 tokens": 30, "2 tokens": 10, "1 token": 3,
    };

    const dealerTotalNow = dealer.length ? total(dealer) : 0;
    const push22Highlight  = stage === "done" && dealerTotalNow === 22 ? "Dealer 22" : null;
    const potOfGoldHighlight = stage === "done" && freeBetTokens > 0
        ? freeBetTokens >= 7 ? "7+ tokens" : `${freeBetTokens} token${freeBetTokens === 1 ? "" : "s"}`
        : null;

    const isFreeDouble      = !!activeHand && isHardFreeDouble(activeHand.cards);
    const isFreeSplitAction = !!activeHand && isFreeSplit(activeHand.cards);

    const buyIn = stage === "betting"
        ? clampMainBet(bet) + clampSideBet(push22Bet) + clampSideBet(potOfGoldBet)
        : totalBuyIn;

    const canDealFromDone =
        stage === "done" && !isShuffling &&
        clampMainBet(bet) >= MIN_BET &&
        bankroll >= clampMainBet(bet) + clampSideBet(push22Bet) + clampSideBet(potOfGoldBet);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <>
            {isShuffling && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="rounded-[4px] border border-amber-300/25 bg-black/65 px-10 py-8 text-center">
                        <div className="text-sm font-extrabold text-amber-200">Free Bet Blackjack</div>
                        <div className="mt-2 text-3xl font-extrabold text-white">Shuffling Shoe</div>
                        <div className="mt-2 text-sm text-amber-100">Please wait…</div>
                    </div>
                </div>
            )}

            <RulesModal open={showRules} onClose={() => setShowRules(false)} />

            <TableShell deckNo={deckNo}
                feltColor="#7f1d1d"
                gameName="Free Bet Blackjack"
                bankroll={bankroll}
                hideHeader
                actionBar={
                    <FreeBetBar
                        stage={stage}
                        isShuffling={isShuffling}
                        bet={bet}
                        buyIn={buyIn}
                        bankroll={bankroll}
                        canDouble={canDouble}
                        doubleForLess={doubleForLess}
                        canSplit={canSplit}
                        isFreeDouble={isFreeDouble}
                        isFreeSplitAction={isFreeSplitAction}
                        isResolvingAction={isResolvingAction}
                        canDealFromDone={canDealFromDone}
                        selectedChip={selectedChip}
                        onChipSelect={handleChipSelect}
                        onClear={clearAll}
                        onReset={resetBets}
                        onChangeBet={changeBet}
                        onDeal={() => void dealOnce()}
                        onHit={() => void runAction(hit)}
                        onStay={() => void runAction(stay)}
                        onDouble={() => void runAction(doubleDown)}
                        onSplit={() => void runAction(split)}
                    />
                }
            >
                <div className="flex flex-1 flex-col items-center gap-3 py-0">

                    <TableLabel onShowRules={() => setShowRules(true)} />

                    {/* Felt area: payout columns float left/right at lg */}
                    <div className="relative w-full">

                        <div className="hidden lg:absolute lg:left-0 lg:top-0 lg:block lg:w-[148px] lg:pl-3 lg:pr-2">
                            <PayoutColumn title="Push 22" entries={push22Entries} highlight={push22Highlight} />
                        </div>

                        <div className="hidden lg:absolute lg:right-0 lg:top-0 lg:block lg:w-[148px] lg:pl-2 lg:pr-3">
                            <PayoutColumn title="Pot of Gold" entries={potOfGoldEntries} highlight={potOfGoldHighlight} />
                        </div>

                        {/* Main content column */}
                        <div className="flex flex-col items-center gap-3 lg:px-[164px]">

                            <DealerLane cards={dealer} revealedCount={dealerRevealedCount} stage={stage} />

                            <BetBar
                                pendingBet={displayBet}
                                returned={roundBreakdown.totalReturned}
                                net={roundBreakdown.totalNet}
                                showResult={showFinalNet}
                            />

                            {/* Free bet token counter */}
                            <div className={`flex items-center gap-1.5 rounded-[2px] border px-3 py-1 transition-colors ${
                                freeBetTokens > 0 ? "border-emerald-400/40 bg-emerald-500/15" : "border-white/10 bg-black/20"
                            }`}>
                                <span className={`text-[13px] font-bold ${freeBetTokens > 0 ? "text-emerald-300/80" : "text-white/75"}`}>
                                    Tokens
                                </span>
                                <span className={`text-sm font-extrabold ${freeBetTokens > 0 ? "text-emerald-100" : "text-white/75"}`}>
                                    {freeBetTokens}
                                </span>
                            </div>

                            <p className="text-sm font-semibold text-amber-100">{message}</p>

                            {/* The bet circles and the hands share this one place, so nothing moves at the deal. */}
                            <div className="grid w-full justify-items-center [&>*]:col-start-1 [&>*]:row-start-1">
                            {/* Bet circles: betting stage only */}
                            <AnimatePresence mode="popLayout" initial={false}>
                                {stage === "betting" && (
                                    <motion.div
                                        key="bet-circles"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        className="flex items-end justify-center gap-6"
                                    >
                                        <BetSpot
                                            testId="push22"
                                            chips={push22Stack}
                                            totalBet={push22Bet}
                                            label="Push 22"
                                            sublabel="11 to 1"
                                            dim={82}
                                            isSelected={selectedZone === "push22"}
                                            onSelect={() => setSelectedZone("push22")}
                                            onRemove={() => removeLastChip("push22")}
                                            canBet={!isShuffling}
                                        />

                                        <BetSpot
                                            testId="main"
                                            chips={chipStack}
                                            totalBet={bet}
                                            emptyText="Bet"
                                            dim={100}
                                            isSelected={selectedZone === null}
                                            onSelect={() => setSelectedZone(null)}
                                            onRemove={() => removeLastChip(null)}
                                            canBet={!isShuffling}
                                        />

                                        <BetSpot
                                            testId="potOfGold"
                                            chips={potOfGoldStack}
                                            totalBet={potOfGoldBet}
                                            label="Pot of Gold"
                                            sublabel="varies"
                                            dim={82}
                                            isSelected={selectedZone === "potOfGold"}
                                            onSelect={() => setSelectedZone("potOfGold")}
                                            onRemove={() => removeLastChip("potOfGold")}
                                            canBet={!isShuffling}
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {hands.length > 0 && (
                                <div className="flex flex-wrap justify-center gap-3">
                                    {hands.map((hand, i) => (
                                        <HandBox
                                            key={i}
                                            hand={hand}
                                            index={i}
                                            isActive={i === active && stage === "player"}
                                            stage={stage}
                                            dealerTotal={dealerTotalNow}
                                        />
                                    ))}
                                </div>
                            )}
                            </div>

                        </div>
                    </div>
                </div>
            </TableShell>
        </>
    );
}