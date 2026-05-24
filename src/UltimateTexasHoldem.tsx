import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "./shared/TableShell";
import ChipTray from "./shared/ChipTray";
import PlayingCard from "./shared/Card";
import type { Card as SharedCard } from "./shared/cards";
import type { ChipDenomination } from "./shared/money";
import { formatMoney } from "./shared/money";

// ─── Types ────────────────────────────────────────────────────────────────────

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

type Card = {
    rank: Rank;
    suit: Suit;
    value: number;
    id: string;
};

type Stage = "betting" | "preflop" | "flop" | "river" | "showdown" | "awaitingBonusReveal" | "roundOver";
type Decision = "check" | "bet" | "fold";

type FiveCardCategory =
    | "High Card"
    | "Pair"
    | "Two Pair"
    | "Trips"
    | "Straight"
    | "Flush"
    | "Full House"
    | "Quads"
    | "Straight Flush"
    | "Royal Flush";

type BestFive = {
    category: FiveCardCategory;
    score: number[];
    cards: Card[];
    label: string;
};

type SixCardBonusCategory =
    | "No Bonus"
    | "Trips"
    | "Straight"
    | "Flush"
    | "Full House"
    | "Quads"
    | "Straight Flush"
    | "Royal Flush"
    | "6-Card Straight Flush"
    | "6-Card Royal Flush";

type RoundState = {
    deck: Card[];
    player: Card[];
    dealer: Card[];
    board: Card[];
    hiddenSixBonusCards: Card[];
};

type PayoutBreakdown = {
    ante: number;
    blind: number;
    play: number;
    trips: number;
    sixCardBonus: number;
    total: number;
    net: number;
    summary: string[];
};

type ResolvedHand = {
    playerBest: BestFive | null;
    dealerBest: BestFive | null;
    dealerQualified: boolean;
    compare: number;
    folded: boolean;
    blindCategory: FiveCardCategory | null;
    tripsCategory: FiveCardCategory | null;
    sixCardCategory: SixCardBonusCategory | null;
    blindMultiplier: number;
    tripsMultiplier: number;
    sixCardMultiplier: number;
};

type Props = {
    bankroll: number;
    setBankroll: React.Dispatch<React.SetStateAction<number>>;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUES: Record<Rank, number> = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
    J: 11, Q: 12, K: 13, A: 14,
};

const MIN_MAIN_BET = 5;
const MIN_SIX_BONUS = 5;
const MAX_SIX_BONUS = 25;
const MAX_TRIPS = 100;
const CARD_REVEAL_DELAY_MS = 280;

const TRIPS_PAYTABLE: Record<string, number> = {
    "Royal Flush": 50, "Straight Flush": 40, Quads: 30, "Full House": 8, Flush: 7, Straight: 4, Trips: 3,
};

const BLIND_PAYTABLE: Record<string, number> = {
    "Royal Flush": 500, "Straight Flush": 50, Quads: 10, "Full House": 3, Flush: 1.5, Straight: 1,
};

const SIX_CARD_BONUS_PAYTABLE: Record<Exclude<SixCardBonusCategory, "No Bonus">, number> = {
    "6-Card Royal Flush": 10000, "6-Card Straight Flush": 5000, "Royal Flush": 1000, "Straight Flush": 200,
    Quads: 50, "Full House": 20, Flush: 15, Straight: 10, Trips: 5,
};

// ─── Game functions ───────────────────────────────────────────────────────────

function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shuffle<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ rank, suit, value: RANK_VALUES[rank], id: `${rank}${suit}` });
        }
    }
    return shuffle(deck);
}

function draw(deck: Card[], count: number): [Card[], Card[]] {
    return [deck.slice(0, count), deck.slice(count)];
}

function combinations<T>(arr: T[], k: number): T[][] {
    const out: T[][] = [];
    const path: T[] = [];
    function helper(start: number) {
        if (path.length === k) { out.push([...path]); return; }
        for (let i = start; i < arr.length; i++) {
            path.push(arr[i]); helper(i + 1); path.pop();
        }
    }
    helper(0);
    return out;
}

function getSortedValues(cards: Card[]) {
    return [...cards].map((c) => c.value).sort((a, b) => b - a);
}

function isFlush(cards: Card[]) {
    return cards.every((c) => c.suit === cards[0].suit);
}

function getStraightHigh(valuesDesc: number[]): number | null {
    const unique = [...new Set(valuesDesc)].sort((a, b) => b - a);
    if (unique.includes(14)) unique.push(1);
    let run = 1;
    for (let i = 0; i < unique.length - 1; i++) {
        if (unique[i] - 1 === unique[i + 1]) {
            run++;
            if (run >= 5) return unique[i - 3];
        } else {
            run = 1;
        }
    }
    return null;
}

function countRanks(cards: Card[]) {
    const map = new Map<number, number>();
    for (const card of cards) { map.set(card.value, (map.get(card.value) || 0) + 1); }
    return [...map.entries()].sort((a, b) => { if (b[1] !== a[1]) return b[1] - a[1]; return b[0] - a[0]; });
}

function evaluateFiveCards(cards: Card[]): BestFive {
    const sorted = [...cards].sort((a, b) => b.value - a.value);
    const valuesDesc = getSortedValues(cards);
    const rankCounts = countRanks(cards);
    const flush = isFlush(cards);
    const straightHigh = getStraightHigh(valuesDesc);

    if (flush && straightHigh) {
        const isRoyal = [14, 13, 12, 11, 10].every((v) => valuesDesc.includes(v));
        if (isRoyal) return { category: "Royal Flush", score: [9], cards: sorted, label: "Royal Flush" };
        return { category: "Straight Flush", score: [8, straightHigh], cards: sorted, label: "Straight Flush" };
    }
    if (rankCounts[0][1] === 4) {
        return { category: "Quads", score: [7, rankCounts[0][0], rankCounts[1][0]], cards: sorted, label: "Four of a Kind" };
    }
    if (rankCounts[0][1] === 3 && rankCounts[1][1] === 2) {
        return { category: "Full House", score: [6, rankCounts[0][0], rankCounts[1][0]], cards: sorted, label: "Full House" };
    }
    if (flush) return { category: "Flush", score: [5, ...valuesDesc], cards: sorted, label: "Flush" };
    if (straightHigh) return { category: "Straight", score: [4, straightHigh], cards: sorted, label: "Straight" };
    if (rankCounts[0][1] === 3) {
        const kickers = rankCounts.slice(1).map(([v]) => v).sort((a, b) => b - a);
        return { category: "Trips", score: [3, rankCounts[0][0], ...kickers], cards: sorted, label: "Three of a Kind" };
    }
    if (rankCounts[0][1] === 2 && rankCounts[1][1] === 2) {
        const highPair = Math.max(rankCounts[0][0], rankCounts[1][0]);
        const lowPair = Math.min(rankCounts[0][0], rankCounts[1][0]);
        return { category: "Two Pair", score: [2, highPair, lowPair, rankCounts[2][0]], cards: sorted, label: "Two Pair" };
    }
    if (rankCounts[0][1] === 2) {
        const kickers = rankCounts.slice(1).map(([v]) => v).sort((a, b) => b - a);
        return { category: "Pair", score: [1, rankCounts[0][0], ...kickers], cards: sorted, label: "Pair" };
    }
    return { category: "High Card", score: [0, ...valuesDesc], cards: sorted, label: "High Card" };
}

function compareBestFive(a: BestFive, b: BestFive) {
    const len = Math.max(a.score.length, b.score.length);
    for (let i = 0; i < len; i++) {
        const av = a.score[i] ?? -1;
        const bv = b.score[i] ?? -1;
        if (av > bv) return 1;
        if (av < bv) return -1;
    }
    return 0;
}

function evaluateBestFrom(cards: Card[]): BestFive {
    const combos = combinations(cards, 5);
    let best = evaluateFiveCards(combos[0]);
    for (let i = 1; i < combos.length; i++) {
        const current = evaluateFiveCards(combos[i]);
        if (compareBestFive(current, best) > 0) best = current;
    }
    return best;
}

function dealerQualifies(cards: Card[]) {
    const best = evaluateBestFrom(cards);
    if (best.category !== "High Card") return true;
    const top = [...best.score];
    return top[1] === 14 && top[2] >= 13;
}

function getAllSameSuit(cards: Card[]) {
    return cards.every((card) => card.suit === cards[0].suit);
}

function isSixCardStraight(cards: Card[]) {
    const unique = [...new Set(cards.map((c) => c.value))].sort((a, b) => b - a);
    if (unique.length !== 6) return false;
    const lowAdjusted = unique.includes(14) ? [...unique, 1].sort((a, b) => b - a) : unique;
    let run = 1;
    for (let i = 0; i < lowAdjusted.length - 1; i++) {
        if (lowAdjusted[i] - 1 === lowAdjusted[i + 1]) run++;
        else run = 1;
        if (run >= 6) return true;
    }
    return false;
}

function isRoyalSet(values: number[]) {
    return [10, 11, 12, 13, 14].every((v) => values.includes(v));
}

function evaluateSixCardBonus(cards: Card[]): { category: SixCardBonusCategory; multiplier: number } {
    const values = cards.map((c) => c.value);
    const sameSuit = getAllSameSuit(cards);
    const sixStraight = isSixCardStraight(cards);

    if (sameSuit && sixStraight && isRoyalSet(values))
        return { category: "6-Card Royal Flush", multiplier: SIX_CARD_BONUS_PAYTABLE["6-Card Royal Flush"] };
    if (sameSuit && sixStraight)
        return { category: "6-Card Straight Flush", multiplier: SIX_CARD_BONUS_PAYTABLE["6-Card Straight Flush"] };

    const bestFive = evaluateBestFrom(cards);
    if (bestFive.category === "Royal Flush")   return { category: "Royal Flush",   multiplier: SIX_CARD_BONUS_PAYTABLE["Royal Flush"] };
    if (bestFive.category === "Straight Flush") return { category: "Straight Flush", multiplier: SIX_CARD_BONUS_PAYTABLE["Straight Flush"] };
    if (bestFive.category === "Quads")          return { category: "Quads",          multiplier: SIX_CARD_BONUS_PAYTABLE.Quads };
    if (bestFive.category === "Full House")     return { category: "Full House",     multiplier: SIX_CARD_BONUS_PAYTABLE["Full House"] };
    if (bestFive.category === "Flush")          return { category: "Flush",          multiplier: SIX_CARD_BONUS_PAYTABLE.Flush };
    if (bestFive.category === "Straight")       return { category: "Straight",       multiplier: SIX_CARD_BONUS_PAYTABLE.Straight };
    if (bestFive.category === "Trips")          return { category: "Trips",          multiplier: SIX_CARD_BONUS_PAYTABLE.Trips };
    return { category: "No Bonus", multiplier: 0 };
}

function getTripsPayout(category: FiveCardCategory, stake: number) {
    return stake * (TRIPS_PAYTABLE[category] || 0);
}

function getBlindPayout(category: FiveCardCategory, stake: number) {
    return stake * (BLIND_PAYTABLE[category] || 0);
}

function initialRound(): RoundState {
    return { deck: [], player: [], dealer: [], board: [], hiddenSixBonusCards: [] };
}

function roundResolvedLike(stage: Stage) {
    return stage === "showdown" || stage === "awaitingBonusReveal" || stage === "roundOver";
}

function valueToLabel(value: number) {
    if (value === 14) return "Ace";
    if (value === 13) return "King";
    if (value === 12) return "Queen";
    if (value === 11) return "Jack";
    return String(value);
}

function describeBestHand(best: BestFive | null) {
    if (!best) return "—";
    switch (best.category) {
        case "High Card":     return `${valueToLabel(best.score[1])} High`;
        case "Pair":          return `Pair of ${valueToLabel(best.score[1])}s`;
        case "Two Pair":      return `${valueToLabel(best.score[1])}s and ${valueToLabel(best.score[2])}s`;
        case "Trips":         return `Three ${valueToLabel(best.score[1])}s`;
        case "Straight":      return `${valueToLabel(best.score[1])}-High Straight`;
        case "Flush":         return `${valueToLabel(best.score[1])}-High Flush`;
        case "Full House":    return `${valueToLabel(best.score[1])}s Full of ${valueToLabel(best.score[2])}s`;
        case "Quads":         return `Four ${valueToLabel(best.score[1])}s`;
        case "Straight Flush": return `${valueToLabel(best.score[1])}-High Straight Flush`;
        case "Royal Flush":   return "Royal Flush";
        default:              return best.label;
    }
}

function describeCurrentMadeHand(cards: Card[]) {
    if (cards.length === 0) return "";
    if (cards.length >= 5) return describeBestHand(evaluateBestFrom(cards));
    const rankCounts = countRanks(cards);
    const valuesDesc = getSortedValues(cards);
    if (rankCounts[0][1] === 4) return `Four ${valueToLabel(rankCounts[0][0])}s`;
    if (rankCounts[0][1] === 3 && rankCounts[1]?.[1] === 2)
        return `${valueToLabel(rankCounts[0][0])}s Full of ${valueToLabel(rankCounts[1][0])}s`;
    if (rankCounts[0][1] === 3) return `Three ${valueToLabel(rankCounts[0][0])}s`;
    if (rankCounts[0][1] === 2 && rankCounts[1]?.[1] === 2) {
        const hi = Math.max(rankCounts[0][0], rankCounts[1][0]);
        const lo = Math.min(rankCounts[0][0], rankCounts[1][0]);
        return `${valueToLabel(hi)}s and ${valueToLabel(lo)}s`;
    }
    if (rankCounts[0][1] === 2) return `Pair of ${valueToLabel(rankCounts[0][0])}s`;
    return `${valueToLabel(valuesDesc[0])} High`;
}

// ─── Rules modal ──────────────────────────────────────────────────────────────

function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    if (!open) return null;
    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
                <button className="absolute inset-0 bg-black/70 backdrop-blur-[3px]" onClick={onClose} aria-label="Close rules modal" />
                <motion.div
                    initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 16, scale: 0.98 }} transition={{ duration: 0.22, ease: "easeOut" }}
                    className="relative z-[101] max-h-[88dvh] w-full max-w-[860px] overflow-hidden rounded-[1.5rem] border border-amber-300/20 bg-[linear-gradient(180deg,_rgba(7,20,14,0.98),_rgba(3,10,7,0.98))] text-white shadow-[0_20px_70px_rgba(0,0,0,0.6)]"
                >
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4">
                        <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-amber-200/90 sm:text-[11px]">Help</div>
                            <div className="mt-1 text-lg font-extrabold text-amber-50 sm:text-2xl">Ultimate Texas Hold&apos;em Rules</div>
                        </div>
                        <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl font-bold text-white/85 transition hover:bg-white/10" aria-label="Close rules modal">x</button>
                    </div>
                    <div className="max-h-[calc(88dvh-76px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                        <div className="space-y-4 text-sm leading-6 text-emerald-50/90 sm:text-[15px]">
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">How the Hand Starts</div>
                                <div className="space-y-2">
                                    <div>• You place an Ante.</div>
                                    <div>• The Blind always matches the Ante exactly.</div>
                                    <div>• Trips is optional from $0 to $100.</div>
                                    <div>• 6 Card Bonus is optional, but if used it must be either $0 or at least $5, up to $25.</div>
                                    <div>• You and the dealer each get 2 cards.</div>
                                    <div>• Four separate hidden cards are also dealt for the 6 Card Bonus feature.</div>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">Betting Decisions</div>
                                <div className="space-y-2">
                                    <div>• Preflop: you may bet 4x or 3x your Ante, or check.</div>
                                    <div>• After checking, the flop is revealed.</div>
                                    <div>• Flop: you may bet 2x your Ante, or check again.</div>
                                    <div>• After checking again, the turn and river are revealed.</div>
                                    <div>• River: you may bet 1x your Ante, or fold.</div>
                                    <div>• If you fold, Ante, Blind, Play, and Trips (if applicable) lose immediately.</div>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">Dealer Qualification</div>
                                <div className="space-y-2">
                                    <div>• Dealer qualifies with any Pair or better.</div>
                                    <div>• Dealer also qualifies with Ace-King high.</div>
                                    <div>• If the dealer does not qualify and you win, Ante pushes and Play still wins 1 to 1.</div>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">Main Bet Resolution</div>
                                <div className="space-y-2">
                                    <div>• If you beat a qualifying dealer, Ante and Play both win 1 to 1.</div>
                                    <div>• If the dealer does not qualify and you win, Ante pushes and Play wins 1 to 1.</div>
                                    <div>• If the hand ties, Ante, Blind, and Play all push.</div>
                                    <div>• If the dealer beats you, Ante, Blind, and Play lose.</div>
                                    <div>• Blind only gets paid extra when your final hand is a Straight or better. Otherwise it pushes on a win.</div>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">Blind Pay Table</div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                    <div>Royal Flush</div><div>500 to 1</div>
                                    <div>Straight Flush</div><div>50 to 1</div>
                                    <div>Quads</div><div>10 to 1</div>
                                    <div>Full House</div><div>3 to 1</div>
                                    <div>Flush</div><div>1.5 to 1</div>
                                    <div>Straight</div><div>1 to 1</div>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">Trips Side Bet</div>
                                <div className="space-y-2">
                                    <div>• Trips is independent of whether you beat the dealer.</div>
                                    <div>• It pays based on your final 5-card hand.</div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                    <div>Royal Flush</div><div>50 to 1</div>
                                    <div>Straight Flush</div><div>40 to 1</div>
                                    <div>Quads</div><div>30 to 1</div>
                                    <div>Full House</div><div>8 to 1</div>
                                    <div>Flush</div><div>7 to 1</div>
                                    <div>Straight</div><div>4 to 1</div>
                                    <div>Trips</div><div>3 to 1</div>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">6 Card Bonus</div>
                                <div className="space-y-2">
                                    <div>• This bonus uses your 2 hole cards plus the 4 hidden bonus cards.</div>
                                    <div>• It does not use the regular 5-card board.</div>
                                    <div>• The main hand settles first.</div>
                                    <div>• Then you press Reveal 6 Card Bonus to resolve this side bet.</div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                    <div>6-Card Royal Flush</div><div>10000 to 1</div>
                                    <div>6-Card Straight Flush</div><div>5000 to 1</div>
                                    <div>Royal Flush</div><div>1000 to 1</div>
                                    <div>Straight Flush</div><div>200 to 1</div>
                                    <div>Quads</div><div>50 to 1</div>
                                    <div>Full House</div><div>20 to 1</div>
                                    <div>Flush</div><div>15 to 1</div>
                                    <div>Straight</div><div>10 to 1</div>
                                    <div>Trips</div><div>5 to 1</div>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">Quick Notes</div>
                                <div className="space-y-2">
                                    <div>• Best 5-card poker hand is used for player and dealer.</div>
                                    <div>• Straights can play ace-high or wheel-low where applicable.</div>
                                    <div>• Net result shown by the table is based on total return minus what you committed that hand.</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
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

const CARD_VARIANTS = {
    initial: { opacity: 0, y: -18, scale: 0.94 },
    animate: { opacity: 1, y: 0, scale: 1 },
};

const CARD_TRANSITION = (delay: number) => ({
    duration: 0.32,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    delay,
});

const CARD_CLS = "h-[72px] w-[50px] rounded-[8px]";

function chipColor(chip: ChipDenomination): { bg: string; border: string } {
    if (chip === 1)    return { bg: "#f1f5f9", border: "#94a3b8" };
    if (chip === 2.5)  return { bg: "#ef4444", border: "#dc2626" };
    if (chip === 5)    return { bg: "#e11d48", border: "#be123c" };
    if (chip === 25)   return { bg: "#16a34a", border: "#15803d" };
    if (chip === 100)  return { bg: "#2563eb", border: "#1d4ed8" };
    if (chip === 500)  return { bg: "#7c3aed", border: "#6d28d9" };
    if (chip === 1000) return { bg: "#ea580c", border: "#c2410c" };
    return { bg: "#0f172a", border: "#1e293b" };
}

const DENOM_DESC = [5000, 1000, 500, 100, 25, 5, 2.5, 1] as const;

function buildChipStack(amount: number): ChipDenomination[] {
    const chips: ChipDenomination[] = [];
    let remaining = Math.round(amount * 100) / 100;
    for (const d of DENOM_DESC) {
        while (remaining >= d - 0.001 && chips.length < 8) {
            chips.push(d as ChipDenomination);
            remaining = Math.round((remaining - d) * 100) / 100;
        }
    }
    return chips;
}

// ─── BetBar ───────────────────────────────────────────────────────────────────

function BetBar({ pendingBet, returned, net, showResult }: {
    pendingBet: number; returned: number; net: number; showResult: boolean;
}) {
    const netColor = net > 0 ? "text-emerald-300" : net < 0 ? "text-red-300" : "text-amber-100";
    return (
        <div className="flex items-center justify-center gap-6 rounded-2xl border border-white/10 bg-black/25 px-6 py-2">
            <div className="text-center">
                <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Bet</div>
                <div className="text-sm font-extrabold text-white">{formatMoney(pendingBet)}</div>
            </div>
            {showResult && (
                <>
                    <div className="h-6 w-px bg-white/10" />
                    <div className="text-center">
                        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Returned</div>
                        <div className="text-sm font-extrabold text-emerald-300">{formatMoney(returned)}</div>
                    </div>
                    <div className="h-6 w-px bg-white/10" />
                    <div className="text-center">
                        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Net</div>
                        <div className={`text-sm font-extrabold ${netColor}`}>
                            {net >= 0 ? "+" : ""}{formatMoney(net)}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// ─── BetCircle ────────────────────────────────────────────────────────────────

function BetCircle({ label, sublabel, amount, size, locked, canBet, selectedChip, onAdd, onClear }: {
    label: string;
    sublabel?: string;
    amount: number;
    size: "large" | "small";
    locked?: boolean;
    canBet: boolean;
    selectedChip: ChipDenomination | null;
    onAdd: () => void;
    onClear: () => void;
}) {
    const dim = size === "large" ? 90 : 70;
    const chips = buildChipStack(amount).slice(0, 5);
    const clickable = !locked && canBet && selectedChip != null;
    const clearable = !locked && canBet && amount > 0;

    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative">
                <button
                    onClick={clickable ? onAdd : undefined}
                    disabled={!clickable}
                    className={[
                        "flex flex-col items-center justify-center rounded-full border-2 transition",
                        amount > 0 ? "border-amber-300/50 bg-amber-300/10" : "border-white/20 bg-black/30",
                        clickable ? "hover:border-amber-300/80 hover:bg-amber-300/20 cursor-pointer" : "cursor-default",
                    ].join(" ")}
                    style={{ width: dim, height: dim }}
                >
                    {chips.length > 0 ? (
                        <div className="flex flex-col items-center">
                            <div className="flex flex-col-reverse items-center" style={{ gap: 0 }}>
                                {chips.slice(0, 4).map((chip, i) => {
                                    const c = chipColor(chip);
                                    return (
                                        <div
                                            key={i}
                                            className="rounded-full border"
                                            style={{ width: 22, height: 7, background: c.bg, borderColor: c.border, marginTop: i > 0 ? -3 : 0 }}
                                        />
                                    );
                                })}
                            </div>
                            <span className="mt-1 text-[10px] font-extrabold text-white">{formatMoney(amount)}</span>
                        </div>
                    ) : (
                        <span className="text-[9px] text-white/30">
                            {locked && amount > 0 ? formatMoney(amount) : "—"}
                        </span>
                    )}
                </button>
                {clearable && (
                    <button
                        onClick={onClear}
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/80 text-[11px] font-bold text-white transition hover:bg-red-500"
                        aria-label={`Clear ${label} bet`}
                    >
                        ×
                    </button>
                )}
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/55">{label}</span>
            {sublabel && <span className="text-[8px] tracking-[0.08em] text-white/30">{sublabel}</span>}
        </div>
    );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function UltimateTexasHoldem({ bankroll, setBankroll }: Props) {
    const [stage, setStage] = useState<Stage>("betting");

    const [ante, setAnte] = useState(25);
    const blind = ante;
    const [trips, setTrips] = useState(10);
    const [sixCardBonus, setSixCardBonus] = useState(5);
    const [play, setPlay] = useState(0);

    const [wagerAtDeal, setWagerAtDeal] = useState(0);

    const [pendingSixCardReturn, setPendingSixCardReturn] = useState(0);
    const [pendingSixCardSummary, setPendingSixCardSummary] = useState<string | null>(null);

    const [round, setRound] = useState<RoundState>(initialRound());
    const [message, setMessage] = useState("Set your bets and press Deal.");
    const [payout, setPayout] = useState<PayoutBreakdown | null>(null);
    const [_lastDecision, setLastDecision] = useState<Decision | null>(null);
    const [isRevealing, setIsRevealing] = useState(false);
    const [resolvedHand, setResolvedHand] = useState<ResolvedHand | null>(null);
    const [showRules, setShowRules] = useState(false);
    const [selectedChip, setSelectedChip] = useState<ChipDenomination | null>(null);

    const sixBonusResult = useMemo(() => {
        if (round.hiddenSixBonusCards.length !== 4 || round.player.length !== 2) return null;
        return evaluateSixCardBonus([...round.player, ...round.hiddenSixBonusCards]);
    }, [round.hiddenSixBonusCards, round.player]);

    const playerHandText = useMemo(() => {
        const visibleCards = [...round.player, ...round.board];
        return visibleCards.length > 0 ? describeCurrentMadeHand(visibleCards) : "";
    }, [round.player, round.board]);

    const dealerHandText = useMemo(() => {
        if (!roundResolvedLike(stage)) return "";
        const visibleCards = [...round.dealer, ...round.board];
        return visibleCards.length > 0 ? describeCurrentMadeHand(visibleCards) : "";
    }, [round.dealer, round.board, stage]);

    const totalMainWager = ante + blind + trips + sixCardBonus + play;
    const visibleNet = payout ? payout.net : -wagerAtDeal;
    const showFinalNet = stage === "roundOver";

    const blindHighlight =
        resolvedHand && !resolvedHand.folded && resolvedHand.compare > 0 && resolvedHand.blindMultiplier
            ? resolvedHand.blindCategory : null;
    const tripsHighlight = resolvedHand?.tripsMultiplier ? resolvedHand.tripsCategory : null;
    const sixCardHighlight = stage === "roundOver" && resolvedHand?.sixCardMultiplier ? resolvedHand.sixCardCategory : null;

    const anteResultText = useMemo(() => {
        if (!resolvedHand || !payout) return "Pending";
        if (resolvedHand.folded) return "Lose";
        if (resolvedHand.compare > 0) return resolvedHand.dealerQualified ? "Win 1:1" : "Push";
        if (resolvedHand.compare === 0) return "Push";
        return "Lose";
    }, [resolvedHand, payout]);

    const blindResultText = useMemo(() => {
        if (!resolvedHand || !payout) return "Pending";
        if (resolvedHand.folded) return "Lose";
        if (resolvedHand.compare > 0)
            return resolvedHand.blindMultiplier ? `Win ${resolvedHand.blindMultiplier}:1` : "Push";
        if (resolvedHand.compare === 0) return "Push";
        return "Lose";
    }, [resolvedHand, payout]);

    const playResultText = useMemo(() => {
        if (!resolvedHand || !payout) return play > 0 ? "Pending" : "No Bet";
        if (resolvedHand.folded) return "Lose";
        if (play === 0) return "No Bet";
        if (resolvedHand.compare > 0) return "Win 1:1";
        if (resolvedHand.compare === 0) return "Push";
        return "Lose";
    }, [resolvedHand, payout, play]);

    const tripsResultText = useMemo(() => {
        if (trips <= 0) return "No Bet";
        if (!resolvedHand || !payout) return "Pending";
        return resolvedHand.tripsMultiplier ? `Win ${resolvedHand.tripsMultiplier}:1` : "Lose";
    }, [resolvedHand, payout, trips]);

    const sixCardResultText = useMemo(() => {
        if (sixCardBonus <= 0) return "No Bet";
        if (stage === "awaitingBonusReveal") return "Pending Reveal";
        if (stage !== "roundOver") return "Pending";
        if (!resolvedHand || !payout) return "Pending";
        return resolvedHand.sixCardMultiplier ? `Win ${resolvedHand.sixCardMultiplier}:1` : "Lose";
    }, [resolvedHand, payout, stage, sixCardBonus]);

    const settleRound = (playStake: number, folded: boolean, finalRound: RoundState) => {
        const fullBoard = finalRound.board;
        const playerEval = evaluateBestFrom([...finalRound.player, ...fullBoard]);
        const dealerEval = evaluateBestFrom([...finalRound.dealer, ...fullBoard]);
        const dealerQualified = dealerQualifies([...finalRound.dealer, ...fullBoard]);
        const compare = compareBestFive(playerEval, dealerEval);
        const sixBonus = evaluateSixCardBonus([...finalRound.player, ...finalRound.hiddenSixBonusCards]);

        let anteReturn = 0, blindReturn = 0, playReturn = 0, tripsReturn = 0, sixReturn = 0;
        const summary: string[] = [];

        if (!folded) {
            if (compare > 0) {
                if (dealerQualified) {
                    anteReturn = ante * 2;
                    playReturn = playStake * 2;
                    summary.push("Player beats dealer. Ante and Play win 1 to 1.");
                } else {
                    anteReturn = ante;
                    playReturn = playStake * 2;
                    summary.push("Dealer does not qualify. Ante pushes, Play wins 1 to 1.");
                }
                const blindWin = getBlindPayout(playerEval.category, blind);
                blindReturn = blind + blindWin;
                summary.push(blindWin > 0
                    ? `Blind wins ${blindWin / blind} to 1 on ${playerEval.category}.`
                    : "Blind pushes.");
            } else if (compare === 0) {
                anteReturn = ante; blindReturn = blind; playReturn = playStake;
                summary.push("Player and dealer tie. Ante, Blind, and Play push.");
            } else {
                summary.push("Dealer beats player. Ante, Blind, and Play lose.");
            }
        } else {
            summary.push("Player folds. Ante, Blind, and Play lose.");
        }

        const tripsWin = trips > 0 ? getTripsPayout(playerEval.category, trips) : 0;
        if (trips > 0) {
            if (tripsWin > 0) {
                tripsReturn = trips + tripsWin;
                summary.push(`Trips wins ${tripsWin / trips} to 1 on ${playerEval.category}.`);
            } else {
                summary.push("Trips loses.");
            }
        }

        if (sixCardBonus > 0) {
            if (sixBonus.multiplier > 0) {
                sixReturn = sixCardBonus + sixCardBonus * sixBonus.multiplier;
                setPendingSixCardSummary(`6 Card Bonus wins ${sixBonus.multiplier} to 1 on ${sixBonus.category}.`);
            } else {
                setPendingSixCardSummary("6 Card Bonus loses.");
            }
        } else {
            setPendingSixCardSummary(null);
        }

        setResolvedHand({
            playerBest: playerEval, dealerBest: dealerEval, dealerQualified, compare, folded,
            blindCategory: playerEval.category, tripsCategory: playerEval.category,
            sixCardCategory: sixBonus.category,
            blindMultiplier: BLIND_PAYTABLE[playerEval.category] || 0,
            tripsMultiplier: TRIPS_PAYTABLE[playerEval.category] || 0,
            sixCardMultiplier: sixBonus.multiplier,
        });

        setPendingSixCardReturn(sixReturn);
        const totalReturn = anteReturn + blindReturn + playReturn + tripsReturn;
        const net = totalReturn - wagerAtDeal;
        setBankroll((b) => b + totalReturn);
        setPayout({ ante: anteReturn, blind: blindReturn, play: playReturn, trips: tripsReturn, sixCardBonus: 0, total: totalReturn, net, summary });

        if (sixCardBonus > 0) {
            setStage("awaitingBonusReveal");
            setMessage("Main hand settled. Press Reveal 6 Card Bonus.");
        } else {
            setStage("roundOver");
            setMessage("Round complete.");
        }
    };

    const startRound = () => {
        const normalizedAnte = Math.max(MIN_MAIN_BET, Math.floor(ante / 5) * 5);
        const normalizedTrips = Math.min(MAX_TRIPS, Math.max(0, Math.floor(trips / 5) * 5));
        const normalizedSix = Math.min(MAX_SIX_BONUS, Math.max(0, Math.floor(sixCardBonus / 5) * 5));

        if (normalizedSix !== 0 && normalizedSix < MIN_SIX_BONUS) {
            setMessage("6 Card Bonus must be 0 or at least $5.");
            return;
        }

        const totalBet = normalizedAnte + normalizedAnte + normalizedTrips + normalizedSix;
        if (bankroll < totalBet) {
            setMessage("Not enough bankroll for those bets.");
            return;
        }

        const deck = createDeck();
        let nextDeck = deck;
        let player: Card[], dealer: Card[], hiddenSix: Card[];
        [player, nextDeck] = draw(nextDeck, 2);
        [dealer, nextDeck] = draw(nextDeck, 2);
        [hiddenSix, nextDeck] = draw(nextDeck, 4);

        setAnte(normalizedAnte);
        setTrips(normalizedTrips);
        setSixCardBonus(normalizedSix);
        setPlay(0);
        setWagerAtDeal(totalBet);
        setPayout(null);
        setResolvedHand(null);
        setLastDecision(null);
        setPendingSixCardReturn(0);
        setPendingSixCardSummary(null);
        setBankroll((b) => b - totalBet);
        setRound({ deck: nextDeck, player, dealer, board: [], hiddenSixBonusCards: hiddenSix });
        setStage("preflop");
        setMessage("Cards dealt. Bet 3x or 4x now, or check.");
    };

    const revealFlop = async () => {
        if (isRevealing) return;
        setIsRevealing(true);
        setLastDecision("check");
        setMessage("Revealing flop...");

        let nextDeck = [...round.deck];
        const [flop, afterFlop] = draw(nextDeck, 3);
        nextDeck = afterFlop;
        setRound((r) => ({ ...r, deck: nextDeck, board: [] }));

        for (let i = 0; i < flop.length; i++) {
            await wait(CARD_REVEAL_DELAY_MS);
            setRound((r) => ({ ...r, board: [...r.board, flop[i]] }));
        }

        setStage("flop");
        setMessage("Flop is out. Bet 2x now, or check.");
        setIsRevealing(false);
    };

    const revealTurnAndRiver = async (goToShowdownAfter: boolean, playStake = play) => {
        if (isRevealing) return;
        setIsRevealing(true);
        setMessage("Revealing turn and river...");

        let nextDeck = [...round.deck];
        const [runout, afterRunout] = draw(nextDeck, 2);
        nextDeck = afterRunout;
        setRound((r) => ({ ...r, deck: nextDeck }));

        for (let i = 0; i < runout.length; i++) {
            await wait(CARD_REVEAL_DELAY_MS);
            setRound((r) => ({ ...r, board: [...r.board, runout[i]] }));
        }

        const finalRound = { ...round, deck: nextDeck, board: [...round.board, ...runout] };

        if (goToShowdownAfter) {
            setStage("showdown");
            settleRound(playStake, false, finalRound);
        } else {
            setStage("river");
            setMessage("River is out. Bet 1x now, or fold.");
        }

        setIsRevealing(false);
    };

    const placePlayBet = async (multiplier: number) => {
        if (isRevealing) return;
        const stake = ante * multiplier;
        if (bankroll < stake) {
            setMessage("Not enough bankroll for that play bet.");
            return;
        }

        setBankroll((b) => b - stake);
        setPlay(stake);
        setLastDecision("bet");

        if (stage === "preflop") {
            setIsRevealing(true);
            let nextDeck = [...round.deck];
            const [board, afterBoard] = draw(nextDeck, 5);
            nextDeck = afterBoard;
            setRound((r) => ({ ...r, deck: nextDeck, board: [] }));
            setMessage(`Play bet placed for ${multiplier}x. Revealing board...`);

            for (let i = 0; i < 3; i++) {
                await wait(250);
                setRound((r) => ({ ...r, board: [...r.board, board[i]] }));
            }
            await wait(1000);
            for (let i = 3; i < 5; i++) {
                await wait(250);
                setRound((r) => ({ ...r, board: [...r.board, board[i]] }));
            }

            const nextRound = { ...round, deck: nextDeck, board };
            setStage("showdown");
            setMessage(`Play bet placed for ${multiplier}x. Settling hand.`);
            settleRound(stake, false, nextRound);
            setIsRevealing(false);
            return;
        }

        if (stage === "flop") {
            await revealTurnAndRiver(true, stake);
            return;
        }

        if (stage === "river") {
            setStage("showdown");
            setMessage(`Play bet placed for ${multiplier}x. Settling hand.`);
            settleRound(stake, false, round);
        }
    };

    const revealRiver = async () => {
        setLastDecision("check");
        await revealTurnAndRiver(false);
    };

    const foldHand = () => {
        if (isRevealing) return;
        setPlay(0);
        setLastDecision("fold");
        setStage("showdown");
        setMessage("Player folds.");
        settleRound(0, true, round);
    };

    const revealSixCardBonus = () => {
        if (!payout) return;
        const bonusSummary = pendingSixCardSummary ? [pendingSixCardSummary] : [];
        const updatedTotal = payout.total + pendingSixCardReturn;
        const updatedNet = updatedTotal - (wagerAtDeal + play);
        setBankroll((b) => b + pendingSixCardReturn);
        setPayout({ ...payout, sixCardBonus: pendingSixCardReturn, total: updatedTotal, net: updatedNet, summary: [...payout.summary, ...bonusSummary] });
        setPendingSixCardReturn(0);
        setPendingSixCardSummary(null);
        setStage("roundOver");
        setMessage("6 Card Bonus revealed.");
    };

    const resetForNextRound = () => {
        setPlay(0);
        setWagerAtDeal(0);
        setRound(initialRound());
        setPayout(null);
        setResolvedHand(null);
        setStage("betting");
        setMessage("Set your bets and press Deal.");
        setLastDecision(null);
        setPendingSixCardReturn(0);
        setPendingSixCardSummary(null);
        setIsRevealing(false);
    };

    const canAct = !isRevealing;
    const isBetting = stage === "betting";
    const dealerRevealed = roundResolvedLike(stage);
    const committedBet = isBetting ? totalMainWager : wagerAtDeal + play;
    const showSixCardView = stage === "roundOver" && sixCardBonus > 0;

    // ── Action bar ────────────────────────────────────────────────────────────

    const btnBase = "min-w-[88px] rounded-full border px-5 py-2 text-sm font-extrabold shadow-lg transition disabled:opacity-45 active:translate-y-px";
    const btnGold = `${btnBase} border-amber-200/80 bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 hover:brightness-105`;
    const btnGray = `${btnBase} border-slate-500/60 bg-gradient-to-b from-slate-500 to-slate-700 text-white hover:brightness-110`;
    const btnRed  = `${btnBase} border-red-300/60 bg-gradient-to-b from-red-500 to-red-700 text-white hover:brightness-105`;
    const btnGreen = `${btnBase} border-emerald-200/70 bg-gradient-to-b from-emerald-400 to-emerald-600 text-slate-950 hover:brightness-105`;

    const actionBar = (
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-white/10 bg-black/55 px-4 py-3 backdrop-blur-xl">
            <ChipTray selectedChip={selectedChip as ChipDenomination} onSelect={setSelectedChip} disabled={!isBetting} />

            <div className="flex items-center justify-center gap-2">
                <AnimatePresence mode="wait" initial={false}>
                    {isBetting && (
                        <motion.div key="deal" className="flex gap-2"
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}
                        >
                            <motion.button
                                onClick={startRound} disabled={!canAct}
                                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                                className="rounded-full border border-amber-200/80 bg-gradient-to-b from-amber-300 to-amber-500 px-10 py-2.5 text-sm font-extrabold text-slate-950 shadow-lg transition disabled:opacity-45"
                            >
                                Deal
                            </motion.button>
                        </motion.div>
                    )}
                    {stage === "preflop" && (
                        <motion.div key="preflop" className="flex gap-2"
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}
                        >
                            <button onClick={() => void placePlayBet(4)} disabled={!canAct} className={btnGold}>Bet 4x</button>
                            <button onClick={() => void placePlayBet(3)} disabled={!canAct} className={btnGold}>Bet 3x</button>
                            <button onClick={() => void revealFlop()} disabled={!canAct} className={btnGray}>Check</button>
                        </motion.div>
                    )}
                    {stage === "flop" && (
                        <motion.div key="flop" className="flex gap-2"
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}
                        >
                            <button onClick={() => void placePlayBet(2)} disabled={!canAct} className={btnGold}>Bet 2x</button>
                            <button onClick={() => void revealRiver()} disabled={!canAct} className={btnGray}>Check</button>
                        </motion.div>
                    )}
                    {stage === "river" && (
                        <motion.div key="river" className="flex gap-2"
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}
                        >
                            <button onClick={() => void placePlayBet(1)} disabled={!canAct} className={btnGold}>Bet 1x</button>
                            <button onClick={foldHand} disabled={!canAct} className={btnRed}>Fold</button>
                        </motion.div>
                    )}
                    {stage === "awaitingBonusReveal" && (
                        <motion.div key="reveal" className="flex gap-2"
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}
                        >
                            <button onClick={revealSixCardBonus} disabled={!canAct} className={btnGold}>Reveal 6 Card Bonus</button>
                        </motion.div>
                    )}
                    {stage === "roundOver" && (
                        <motion.div key="next" className="flex gap-2"
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}
                        >
                            <button onClick={resetForNextRound} disabled={!canAct} className={btnGreen}>Next Hand</button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="invisible" aria-hidden>
                <ChipTray selectedChip={selectedChip as ChipDenomination} onSelect={() => {}} />
            </div>
        </div>
    );

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />
            <TableShell
                feltColor="#1a3a5c"
                gameName="Ultimate Texas Hold'em"
                bankroll={bankroll}
                hideHeader
                actionBar={actionBar}
            >
                {/* Table label */}
                <div className="mb-3 flex select-none flex-col items-center gap-1">
                    <div className="flex items-center gap-2">
                        <h1
                            className="text-2xl font-extrabold uppercase tracking-[0.18em] text-amber-100/90"
                            style={{ fontFamily: "Georgia, serif", textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}
                        >
                            Ultimate Texas Hold&apos;em
                        </h1>
                        <button
                            onClick={() => setShowRules(true)}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-300/30 bg-black/25 text-[11px] font-extrabold text-amber-100 transition hover:bg-amber-300/15"
                            aria-label="Show rules"
                        >
                            i
                        </button>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-bold tracking-[0.15em] text-white/35">
                        <span>DEALER QUALIFIES WITH PAIR OR A-K</span>
                        <span className="text-white/20">·</span>
                        <span>BLIND PAYS ON STRAIGHT OR BETTER</span>
                    </div>
                </div>

                {/* BetBar */}
                <div className="mb-3">
                    <BetBar
                        pendingBet={committedBet}
                        returned={payout ? payout.total : 0}
                        net={showFinalNet ? (payout ? payout.net : visibleNet) : visibleNet}
                        showResult={showFinalNet}
                    />
                </div>

                {/* Cards area */}
                <AnimatePresence mode="wait">
                    {showSixCardView ? (
                        <motion.div
                            key="six-card-view"
                            initial={{ opacity: 0, y: 20, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                            className="flex flex-col items-center gap-2"
                        >
                            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">6 Card Bonus</span>
                            <div className="flex flex-wrap items-center justify-center gap-2">
                                {round.player.map((card) => (
                                    <PlayingCard key={card.id} card={toShared(card, true)} className={CARD_CLS} />
                                ))}
                                <span className="text-lg font-bold text-white/40">+</span>
                                {round.hiddenSixBonusCards.map((card, i) => (
                                    <motion.div
                                        key={card.id}
                                        variants={CARD_VARIANTS}
                                        initial="initial"
                                        animate="animate"
                                        transition={CARD_TRANSITION(i * 0.1)}
                                    >
                                        <PlayingCard card={toShared(card, true)} className={CARD_CLS} />
                                    </motion.div>
                                ))}
                            </div>
                            {sixBonusResult && (
                                <span className={`text-sm font-extrabold ${sixBonusResult.category === "No Bonus" ? "text-white/50" : "text-amber-200"}`}>
                                    {sixBonusResult.category}
                                    {sixCardHighlight && sixCardHighlight !== "No Bonus" && (
                                        <span className="ml-2 text-[10px] text-emerald-300">{sixCardResultText}</span>
                                    )}
                                </span>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="main-hand-view"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                            className="flex flex-col items-center gap-3"
                        >
                            {/* Dealer */}
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Dealer</span>
                                <div className="flex gap-2">
                                    <AnimatePresence>
                                        {round.dealer.map((card, i) => (
                                            <motion.div key={card.id} variants={CARD_VARIANTS} initial="initial" animate="animate" transition={CARD_TRANSITION(i * 0.1)}>
                                                <PlayingCard card={toShared(card, dealerRevealed)} className={CARD_CLS} />
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                    {round.dealer.length === 0 && (
                                        <div className="flex gap-2 opacity-20">
                                            <div className={`${CARD_CLS} border border-white/20 bg-white/5`} />
                                            <div className={`${CARD_CLS} border border-white/20 bg-white/5`} />
                                        </div>
                                    )}
                                </div>
                                {dealerHandText && (
                                    <span className="text-xs font-semibold text-amber-100/70">{dealerHandText}</span>
                                )}
                            </div>

                            {/* Board */}
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Board</span>
                                <div className="flex gap-1.5">
                                    <AnimatePresence>
                                        {round.board.map((card, i) => (
                                            <motion.div key={card.id} variants={CARD_VARIANTS} initial="initial" animate="animate" transition={CARD_TRANSITION(i * 0.08)}>
                                                <PlayingCard card={toShared(card, true)} className={CARD_CLS} />
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                    {stage !== "betting" && round.board.length < 5 && Array.from({ length: 5 - round.board.length }).map((_, i) => (
                                        <div key={i} className={`${CARD_CLS} border border-white/10 bg-white/5 opacity-20`} />
                                    ))}
                                </div>
                            </div>

                            {/* Player */}
                            <div className="flex flex-col items-center gap-1">
                                {playerHandText && (
                                    <span className="text-xs font-semibold text-amber-100/70">{playerHandText}</span>
                                )}
                                <div className="flex gap-2">
                                    <AnimatePresence>
                                        {round.player.map((card, i) => (
                                            <motion.div key={card.id} variants={CARD_VARIANTS} initial="initial" animate="animate" transition={CARD_TRANSITION(i * 0.1)}>
                                                <PlayingCard card={toShared(card, true)} className={CARD_CLS} />
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                    {round.player.length === 0 && (
                                        <div className="flex gap-2 opacity-20">
                                            <div className={`${CARD_CLS} border border-white/20 bg-white/5`} />
                                            <div className={`${CARD_CLS} border border-white/20 bg-white/5`} />
                                        </div>
                                    )}
                                </div>
                                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Player</span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Message */}
                <div className="my-2 text-center text-sm font-semibold text-amber-50/70">{message}</div>

                {/* Betting circles */}
                <div className="flex flex-col items-center gap-4 py-1">
                    {/* Side bets row */}
                    <div className="flex items-end gap-10">
                        <BetCircle
                            label="TRIPS"
                            sublabel={`max $${MAX_TRIPS}`}
                            amount={trips}
                            size="small"
                            canBet={isBetting}
                            selectedChip={selectedChip}
                            onAdd={() => setTrips((t) => Math.min(MAX_TRIPS, t + (selectedChip ?? 0)))}
                            onClear={() => setTrips(0)}
                        />
                        <BetCircle
                            label="6 CARD"
                            sublabel={`max $${MAX_SIX_BONUS}`}
                            amount={sixCardBonus}
                            size="small"
                            canBet={isBetting}
                            selectedChip={selectedChip}
                            onAdd={() => setSixCardBonus((v) => Math.min(MAX_SIX_BONUS, v + (selectedChip ?? 0)))}
                            onClear={() => setSixCardBonus(0)}
                        />
                    </div>
                    {/* Main bets row */}
                    <div className="flex items-end gap-6">
                        <BetCircle
                            label="ANTE"
                            amount={ante}
                            size="large"
                            canBet={isBetting}
                            selectedChip={selectedChip}
                            onAdd={() => setAnte((a) => a + (selectedChip ?? 0))}
                            onClear={() => setAnte(0)}
                        />
                        <BetCircle
                            label="BLIND"
                            sublabel="= ANTE"
                            amount={blind}
                            size="large"
                            locked
                            canBet={false}
                            selectedChip={null}
                            onAdd={() => {}}
                            onClear={() => {}}
                        />
                        <BetCircle
                            label="PLAY"
                            amount={play}
                            size="large"
                            locked
                            canBet={false}
                            selectedChip={null}
                            onAdd={() => {}}
                            onClear={() => {}}
                        />
                    </div>
                </div>

                {/* Settlement panel */}
                {resolvedHand && payout && stage === "roundOver" && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25 }}
                        className="mt-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3"
                    >
                        {/* Hand descriptions */}
                        <div className="mb-2 flex items-center justify-center gap-4 text-xs">
                            <div className="text-center">
                                <div className="text-[9px] uppercase tracking-[0.14em] text-white/40">Player</div>
                                <div className="font-extrabold text-amber-100">{describeBestHand(resolvedHand.playerBest)}</div>
                            </div>
                            <div className="h-8 w-px bg-white/10" />
                            <div className="text-center">
                                <div className="text-[9px] uppercase tracking-[0.14em] text-white/40">Dealer</div>
                                <div className="font-bold text-white/80">
                                    {describeBestHand(resolvedHand.dealerBest)}
                                    {!resolvedHand.dealerQualified && (
                                        <span className="ml-1 text-[9px] text-amber-300/70">(no qualify)</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Result rows */}
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            {[
                                { name: "Ante",   result: anteResultText,    highlight: null },
                                { name: "Blind",  result: blindResultText,   highlight: blindHighlight },
                                { name: "Play",   result: playResultText,    highlight: null },
                                { name: "Trips",  result: tripsResultText,   highlight: tripsHighlight },
                                { name: "6 Card", result: sixCardResultText, highlight: sixCardHighlight },
                            ].map(({ name, result, highlight }) => {
                                const isWin = result.startsWith("Win");
                                const isLose = result === "Lose";
                                return (
                                    <div
                                        key={name}
                                        className={[
                                            "rounded-xl border px-3 py-1.5 text-center text-xs",
                                            isWin ? "border-emerald-300/30 bg-emerald-300/10" : isLose ? "border-red-300/20 bg-red-300/5" : "border-white/10 bg-white/5",
                                        ].join(" ")}
                                    >
                                        <div className="text-[9px] uppercase tracking-[0.12em] text-white/40">{name}</div>
                                        <div className={`font-extrabold ${isWin ? "text-emerald-300" : isLose ? "text-red-300" : "text-amber-100"}`}>
                                            {result}
                                        </div>
                                        {highlight && (
                                            <div className="text-[9px] text-amber-200/60">{highlight}</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </TableShell>
        </>
    );
}
