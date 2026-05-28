import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "./shared/TableShell";
import ChipTray from "./shared/ChipTray";
import PlayingCard from "./shared/Card";
import type { Card as SharedCard } from "./shared/cards";
import { type ChipDenomination, formatMoney, CHIP_COLORS, buildChipStackFromAmount, BTN_NEUTRAL, BTN_GOLD, BTN_GREEN } from "./shared/money";
import { SlideBtn } from "./shared/SlideBtn";

// ─── Game types (preserved) ───────────────────────────────────────────────────

type Suit = "♠" | "♥" | "♦" | "♣" | "🃏";
type Rank =
    | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
    | "J" | "Q" | "K" | "A" | "JOKER";

type Card = { rank: Rank; suit: Suit; id: string };

type Props = {
    bankroll: number;
    setBankroll: React.Dispatch<React.SetStateAction<number>>;
};

type Stage = "betting" | "setting" | "showdown";

type FrontEval = {
    category: "High Card" | "Pair";
    score: number[];
    label: string;
};

type FiveEval = {
    category:
        | "High Card" | "Pair" | "Two Pair" | "Trips"
        | "Straight" | "Flush" | "Full House" | "Quads"
        | "Straight Flush" | "Royal Flush" | "Five Aces";
    score: number[];
    label: string;
    usedJoker: boolean;
};

type SplitEval = {
    front: Card[];
    back: Card[];
    frontEval: FrontEval;
    backEval: FiveEval;
    scoreVector: number[];
};

type FortuneCategory =
    | "Natural 7 Card S/F" | "Royal Flush + R/M" | "Wild 7 Card S/F"
    | "5 Aces" | "Royal Flush" | "Straight Flush" | "4 of a Kind"
    | "Full House" | "Flush" | "3 of a Kind" | "Straight"
    | "Three Pair" | "No Fortune";

type FortuneResult = {
    category: FortuneCategory;
    multiplier: number;
};

// ─── UI type ──────────────────────────────────────────────────────────────────

type BetSpot = "main" | "fortune" | "aceHigh";

// ─── Game constants (preserved) ───────────────────────────────────────────────

const SUITS: Exclude<Suit, "🃏">[] = ["♠", "♥", "♦", "♣"];
const RANKS: Exclude<Rank, "JOKER">[] = [
    "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
];

const VALUE: Record<Exclude<Rank, "JOKER">, number> = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
    "10": 10, J: 11, Q: 12, K: 13, A: 14,
};

const MAIN_MIN = 5;
const SIDE_MIN = 0;

const FORTUNE_PAYTABLE_1: Record<Exclude<FortuneCategory, "No Fortune">, number> = {
    "Natural 7 Card S/F": 5000,
    "Royal Flush + R/M": 1000,
    "Wild 7 Card S/F": 750,
    "5 Aces": 250,
    "Royal Flush": 100,
    "Straight Flush": 50,
    "4 of a Kind": 20,
    "Full House": 5,
    "Flush": 4,
    "3 of a Kind": 3,
    "Straight": 2,
    "Three Pair": 0,
};

const ACE_HIGH_PAYTABLE = {
    dealerAceHighNoJoker: 5,
    dealerAceHighWithJoker: 15,
    bothAceHigh: 40,
};

// ─── Game pure functions (preserved byte-for-byte) ────────────────────────────

function isJoker(card: Card) {
    return card.rank === "JOKER";
}

function clampBet(n: number, min: number) {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.floor(n / 2.5) * 2.5);
}

function shuffle<T>(items: T[]) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function createDeck(): Card[] {
    const out: Card[] = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            out.push({ rank, suit, id: `${rank}${suit}` });
        }
    }
    out.push({ rank: "JOKER", suit: "🃏", id: "JOKER" });
    return shuffle(out);
}

function draw(deck: Card[], count: number): [Card[], Card[]] {
    return [deck.slice(0, count), deck.slice(count)];
}

function valueOf(card: Card) {
    if (card.rank === "JOKER") return 15;
    return VALUE[card.rank];
}

function combinations<T>(arr: T[], k: number): T[][] {
    const out: T[][] = [];
    const path: T[] = [];
    function dfs(start: number) {
        if (path.length === k) { out.push([...path]); return; }
        for (let i = start; i < arr.length; i++) {
            path.push(arr[i]); dfs(i + 1); path.pop();
        }
    }
    dfs(0);
    return out;
}

function labelValue(v: number) {
    if (v === 14) return "Ace";
    if (v === 13) return "King";
    if (v === 12) return "Queen";
    if (v === 11) return "Jack";
    return String(v);
}

function countValues(values: number[]) {
    const map = new Map<number, number>();
    for (const v of values) { map.set(v, (map.get(v) || 0) + 1); }
    return [...map.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return b[0] - a[0];
    });
}

function paiGowStraightScore(values: number[]): number | null {
    const uniq = [...new Set(values)].sort((a, b) => b - a);
    const set = new Set(uniq);
    if ([14, 13, 12, 11, 10].every((v) => set.has(v))) return 100;
    if ([14, 5, 4, 3, 2].every((v) => set.has(v))) return 99;
    for (let hi = 13; hi >= 5; hi--) {
        const seq = [hi, hi - 1, hi - 2, hi - 3, hi - 4];
        if (seq.every((v) => set.has(v))) return hi;
    }
    return null;
}

function evaluateNaturalFive(cards: Card[]): FiveEval {
    const values = cards.map((c) => valueOf(c)).sort((a, b) => b - a);
    const suits = cards.map((c) => c.suit);
    const flush = suits.every((s) => s === suits[0]);
    const straightScore = paiGowStraightScore(values);
    const counts = countValues(values);

    if (counts.length === 1 && counts[0][0] === 14 && counts[0][1] === 5) {
        return { category: "Five Aces", score: [10, 14], label: "Five Aces", usedJoker: false };
    }
    if (flush && straightScore === 100) {
        return { category: "Royal Flush", score: [9, 100], label: "Royal Flush", usedJoker: false };
    }
    if (flush && straightScore !== null) {
        return {
            category: "Straight Flush", score: [8, straightScore],
            label: straightScore === 99 ? "Wheel Straight Flush" : "Straight Flush", usedJoker: false,
        };
    }
    if (counts[0][1] === 4) {
        return { category: "Quads", score: [7, counts[0][0], counts[1][0]], label: `Four ${labelValue(counts[0][0])}s`, usedJoker: false };
    }
    if (counts[0][1] === 3 && counts[1][1] === 2) {
        return {
            category: "Full House", score: [6, counts[0][0], counts[1][0]],
            label: `${labelValue(counts[0][0])}s Full of ${labelValue(counts[1][0])}s`, usedJoker: false,
        };
    }
    if (flush) {
        return { category: "Flush", score: [5, ...values], label: `${labelValue(values[0])}-High Flush`, usedJoker: false };
    }
    if (straightScore !== null) {
        return {
            category: "Straight", score: [4, straightScore],
            label: straightScore === 99 ? "Wheel Straight" : `${labelValue(straightScore)}-High Straight`, usedJoker: false,
        };
    }
    if (counts[0][1] === 3) {
        const kickers = counts.slice(1).map(([v]) => v).sort((a, b) => b - a);
        return { category: "Trips", score: [3, counts[0][0], ...kickers], label: `Three ${labelValue(counts[0][0])}s`, usedJoker: false };
    }
    if (counts[0][1] === 2 && counts[1][1] === 2) {
        const highPair = Math.max(counts[0][0], counts[1][0]);
        const lowPair = Math.min(counts[0][0], counts[1][0]);
        return {
            category: "Two Pair", score: [2, highPair, lowPair, counts[2][0]],
            label: `${labelValue(highPair)}s and ${labelValue(lowPair)}s`, usedJoker: false,
        };
    }
    if (counts[0][1] === 2) {
        const kickers = counts.slice(1).map(([v]) => v).sort((a, b) => b - a);
        return { category: "Pair", score: [1, counts[0][0], ...kickers], label: `Pair of ${labelValue(counts[0][0])}s`, usedJoker: false };
    }
    return { category: "High Card", score: [0, ...values], label: `${labelValue(values[0])} High`, usedJoker: false };
}

function compareVectors(a: number[], b: number[]) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const av = a[i] ?? -1; const bv = b[i] ?? -1;
        if (av > bv) return 1; if (av < bv) return -1;
    }
    return 0;
}

function compareFive(a: FiveEval, b: FiveEval) { return compareVectors(a.score, b.score); }

function evaluateFive(cards: Card[]): FiveEval {
    const jokerCount = cards.filter(isJoker).length;
    if (jokerCount === 0) return evaluateNaturalFive(cards);
    if (jokerCount > 1) {
        return evaluateNaturalFive(
            cards.map((c) => (isJoker(c) ? { rank: "A", suit: "♠", id: "JX" } : c)) as Card[]
        );
    }
    const nonJoker = cards.filter((c) => !isJoker(c));
    let best: FiveEval | null = null;
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            const replacement: Card = { rank, suit, id: `REP-${rank}${suit}` };
            const replaced = [...nonJoker, replacement];
            const natural = evaluateNaturalFive(replaced);
            const replacementIsAce = rank === "A";
            const allowedAsWild =
                natural.category === "Straight" || natural.category === "Flush" ||
                natural.category === "Straight Flush" || natural.category === "Royal Flush";
            const valid = replacementIsAce || allowedAsWild || natural.category === "Five Aces";
            if (!valid) continue;
            const candidate: FiveEval = { ...natural, usedJoker: true };
            if (!best || compareFive(candidate, best) > 0) best = candidate;
        }
    }
    if (!best) {
        const fallback = evaluateNaturalFive([...nonJoker, { rank: "A", suit: "♠", id: "REP-A♠" }]);
        return { ...fallback, usedJoker: true };
    }
    return best;
}

function evaluateFront(cards: Card[]): FrontEval {
    const values = cards.map((c) => (isJoker(c) ? 14 : valueOf(c))).sort((a, b) => b - a);
    if (values[0] === values[1]) {
        return { category: "Pair", score: [1, values[0]], label: `Pair of ${labelValue(values[0])}s` };
    }
    return { category: "High Card", score: [0, values[0], values[1]], label: `${labelValue(values[0])}-${labelValue(values[1])}` };
}

function compareFront(a: FrontEval, b: FrontEval) { return compareVectors(a.score, b.score); }

function isLegalSplit(back: FiveEval, front: FrontEval) {
    if (
        back.category === "Trips" || back.category === "Straight" || back.category === "Flush" ||
        back.category === "Full House" || back.category === "Quads" || back.category === "Straight Flush" ||
        back.category === "Royal Flush" || back.category === "Five Aces" || back.category === "Two Pair"
    ) return true;
    if (back.category === "Pair") {
        if (front.category === "High Card") return true;
        return (back.score[1] ?? 0) > (front.score[1] ?? 0);
    }
    if (back.category === "High Card") {
        if (front.category === "Pair") return false;
        const backTop = [back.score[1] ?? 0, back.score[2] ?? 0];
        const frontTop = [front.score[1] ?? 0, front.score[2] ?? 0];
        return compareVectors(backTop, frontTop) > 0;
    }
    return true;
}

function buildSplit(front: Card[], allCards: Card[]): SplitEval {
    const frontIds = new Set(front.map((c) => c.id));
    const back = allCards.filter((c) => !frontIds.has(c.id));
    const frontEval = evaluateFront(front);
    const backEval = evaluateFive(back);
    return { front, back, frontEval, backEval, scoreVector: [...backEval.score, ...frontEval.score] };
}

function getBackHouseWayTier(backEval: FiveEval) {
    switch (backEval.category) {
        case "Five Aces": case "Royal Flush": case "Straight Flush": case "Quads": return 4;
        case "Full House": return 3;
        case "Flush": case "Straight": case "Trips": return 2;
        default: return 1;
    }
}

function sortCardsByValueDesc(cards: Card[]) {
    return [...cards].sort((a, b) => valueOf(b) - valueOf(a));
}

function groupNonJokerCardsByValue(cards: Card[]) {
    const map = new Map<number, Card[]>();
    for (const card of cards) {
        if (isJoker(card)) continue;
        const v = valueOf(card);
        if (!map.has(v)) map.set(v, []);
        map.get(v)!.push(card);
    }
    return [...map.entries()]
        .map(([value, group]) => ({ value, cards: sortCardsByValueDesc(group), count: group.length }))
        .sort((a, b) => { if (b.count !== a.count) return b.count - a.count; return b.value - a.value; });
}

function trySpecificDealerFront(front: Card[], allCards: Card[]) {
    const split = buildSplit(front, allCards);
    return isLegalSplit(split.backEval, split.frontEval) ? split : null;
}

function chooseBestLegalSplitForNoPair(cards: Card[]) {
    const fronts = combinations(cards, 2);
    let best: SplitEval | null = null;
    let bestScore: number[] | null = null;
    for (const front of fronts) {
        const split = buildSplit(front, cards);
        if (!isLegalSplit(split.backEval, split.frontEval)) continue;
        const score = [
            split.frontEval.category === "Pair" ? 1 : 0,
            ...split.frontEval.score,
            getBackHouseWayTier(split.backEval),
            ...split.backEval.score,
        ];
        if (!best || !bestScore || compareVectors(score, bestScore) > 0) { best = split; bestScore = score; }
    }
    if (best) return best;
    return buildSplit(cards.slice(0, 2), cards);
}

function evaluateDealerHouseWay(cards: Card[]): SplitEval {
    const jokerCount = cards.filter(isJoker).length;
    if (jokerCount > 0) {
        const frontCombos = combinations(cards, 2);
        let best: SplitEval | null = null; let bestScore: number[] | null = null;
        for (const front of frontCombos) {
            const split = buildSplit(front, cards);
            if (!isLegalSplit(split.backEval, split.frontEval)) continue;
            const score = [split.frontEval.category === "Pair" ? 1 : 0, ...split.frontEval.score, getBackHouseWayTier(split.backEval), ...split.backEval.score];
            if (!best || !bestScore || compareVectors(score, bestScore) > 0) { best = split; bestScore = score; }
        }
        return best ?? buildSplit(cards.slice(0, 2), cards);
    }
    const groups = groupNonJokerCardsByValue(cards);
    const pairs = groups.filter((g) => g.count === 2);
    const trips = groups.filter((g) => g.count === 3);
    const quads = groups.filter((g) => g.count === 4);

    if (quads.length === 0 && trips.length === 0 && pairs.length === 0) {
        return chooseBestLegalSplitForNoPair(cards);
    }
    if (quads.length === 0 && trips.length === 0 && pairs.length === 1) {
        const pairCards = pairs[0].cards;
        const sideCards = sortCardsByValueDesc(cards.filter((c) => !pairCards.some((pc) => pc.id === c.id)));
        const split = trySpecificDealerFront(sideCards.slice(0, 2), cards);
        if (split) return split;
    }
    if (quads.length === 0 && trips.length === 0 && pairs.length === 2) {
        const sortedPairs = [...pairs].sort((a, b) => b.value - a.value);
        const highPair = sortedPairs[0].cards; const lowPair = sortedPairs[1].cards;
        const splitLowPairFront = trySpecificDealerFront(lowPair, cards);
        if (splitLowPairFront) return splitLowPairFront;
        const sideCards = sortCardsByValueDesc(cards.filter((c) => !highPair.some((pc) => pc.id === c.id) && !lowPair.some((pc) => pc.id === c.id)));
        const highCardFront = trySpecificDealerFront(sideCards.slice(0, 2), cards);
        if (highCardFront) return highCardFront;
    }
    if (quads.length === 0 && trips.length === 0 && pairs.length === 3) {
        const sortedPairs = [...pairs].sort((a, b) => b.value - a.value);
        const split = trySpecificDealerFront(sortedPairs[2].cards, cards);
        if (split) return split;
    }
    if (quads.length === 0 && trips.length === 1 && pairs.length === 0) {
        const tripCards = trips[0].cards;
        const sideCards = sortCardsByValueDesc(cards.filter((c) => !tripCards.some((tc) => tc.id === c.id)));
        const split = trySpecificDealerFront(sideCards.slice(0, 2), cards);
        if (split) return split;
    }
    if (quads.length === 0 && trips.length === 1 && pairs.length === 1) {
        const pairCards = pairs[0].cards;
        const splitPairFront = trySpecificDealerFront(pairCards, cards);
        if (splitPairFront) return splitPairFront;
        const tripCards = trips[0].cards;
        const sideCards = sortCardsByValueDesc(cards.filter((c) => !tripCards.some((tc) => tc.id === c.id) && !pairCards.some((pc) => pc.id === c.id)));
        const highCardFront = trySpecificDealerFront(sideCards.slice(0, 2), cards);
        if (highCardFront) return highCardFront;
    }
    const frontCombos = combinations(cards, 2);
    let best: SplitEval | null = null; let bestScore: number[] | null = null;
    for (const front of frontCombos) {
        const split = buildSplit(front, cards);
        if (!isLegalSplit(split.backEval, split.frontEval)) continue;
        const score = [split.frontEval.category === "Pair" ? 1 : 0, ...split.frontEval.score, getBackHouseWayTier(split.backEval), ...split.backEval.score];
        if (!best || !bestScore || compareVectors(score, bestScore) > 0) { best = split; bestScore = score; }
    }
    if (!best) return buildSplit(cards.slice(0, 2), cards);
    return best;
}

function evaluateBestSplit(cards: Card[]): { best: SplitEval; allBestFrontKeySet: Set<string> } {
    const frontCombos = combinations(cards, 2);
    let best: SplitEval | null = null;
    const bestKeys = new Set<string>();
    for (const front of frontCombos) {
        const split = buildSplit(front, cards);
        if (!isLegalSplit(split.backEval, split.frontEval)) continue;
        if (!best) { best = split; bestKeys.add([...front].map((c) => c.id).sort().join("|")); continue; }
        const cmp = compareVectors(split.scoreVector, best.scoreVector);
        if (cmp > 0) { best = split; bestKeys.clear(); bestKeys.add([...front].map((c) => c.id).sort().join("|")); }
        else if (cmp === 0) { bestKeys.add([...front].map((c) => c.id).sort().join("|")); }
    }
    if (!best) {
        const fallbackFront = cards.slice(0, 2);
        best = buildSplit(fallbackFront, cards);
        bestKeys.add([...fallbackFront].map((c) => c.id).sort().join("|"));
    }
    return { best, allBestFrontKeySet: bestKeys };
}

function evaluateBestSplitAgainstDealer(
    playerCards: Card[],
    dealerSplit: SplitEval
): { best: SplitEval; allBestFrontKeySet: Set<string> } {
    const frontCombos = combinations(playerCards, 2);
    let best: SplitEval | null = null;
    let bestOutcomeScore: number[] | null = null;
    const bestKeys = new Set<string>();
    for (const front of frontCombos) {
        const split = buildSplit(front, playerCards);
        if (!isLegalSplit(split.backEval, split.frontEval)) continue;
        const backCmp = compareFive(split.backEval, dealerSplit.backEval);
        const frontCmp = compareFront(split.frontEval, dealerSplit.frontEval);
        const wins = (backCmp > 0 ? 1 : 0) + (frontCmp > 0 ? 1 : 0);
        const losses = (backCmp <= 0 ? 1 : 0) + (frontCmp <= 0 ? 1 : 0);
        let outcomeTier = 0;
        if (wins === 2) outcomeTier = 2;
        else if (wins === 1 && losses === 1) outcomeTier = 1;
        const outcomeScore = [outcomeTier, backCmp > 0 ? 1 : 0, frontCmp > 0 ? 1 : 0, ...split.backEval.score, ...split.frontEval.score];
        if (!best || !bestOutcomeScore) { best = split; bestOutcomeScore = outcomeScore; bestKeys.add([...front].map((c) => c.id).sort().join("|")); continue; }
        const cmp = compareVectors(outcomeScore, bestOutcomeScore);
        if (cmp > 0) { best = split; bestOutcomeScore = outcomeScore; bestKeys.clear(); bestKeys.add([...front].map((c) => c.id).sort().join("|")); }
        else if (cmp === 0) { bestKeys.add([...front].map((c) => c.id).sort().join("|")); }
    }
    if (!best) return evaluateBestSplit(playerCards);
    return { best, allBestFrontKeySet: bestKeys };
}

function getHighPaiGowInfo(cards: Card[]) {
    const bestFive = combinations(cards, 5).map((combo) => evaluateFive(combo)).sort((a, b) => compareFive(b, a))[0];
    const hasJoker = cards.some(isJoker);
    const aceHigh = bestFive.category === "High Card" && (bestFive.score[1] ?? 0) === 14;
    return { aceHigh, hasJoker, bestFive };
}

function isNaturalSevenCardStraightFlush(cards: Card[]) {
    if (cards.some(isJoker)) return false;
    const suits = new Set(cards.map((c) => c.suit));
    if (suits.size !== 1) return false;
    const values = cards.map((c) => valueOf(c));
    const uniq = [...new Set(values)].sort((a, b) => a - b);
    if (uniq.length !== 7) return false;
    let consecutive = true;
    for (let i = 1; i < uniq.length; i++) { if (uniq[i] !== uniq[i - 1] + 1) { consecutive = false; break; } }
    const isA234567 = JSON.stringify([...uniq].sort((a, b) => a - b)) === JSON.stringify([2, 3, 4, 5, 6, 7, 14]);
    const wheel = [1, 2, 3, 4, 5, 6, 14];
    const lowMapped = uniq.includes(14) ? [...uniq.filter((v) => v !== 14), 14] : uniq;
    return consecutive || isA234567 || JSON.stringify(lowMapped) === JSON.stringify(wheel);
}

function isWildSevenCardStraightFlush(cards: Card[]) {
    if (!cards.some(isJoker)) return false;
    const noJoker = cards.filter((c) => !isJoker(c));
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            const replaced = [...noJoker, { rank, suit, id: `R-${rank}${suit}` } as Card];
            if (isNaturalSevenCardStraightFlush(replaced)) return true;
        }
    }
    return false;
}

function countSevenCardPairs(cards: Card[]) {
    const values = cards.filter((c) => !isJoker(c)).map((c) => valueOf(c));
    const counts = countValues(values);
    return counts.filter(([, c]) => c >= 2).length;
}

function hasRoyalPlusRM(cards: Card[]) {
    const fiveCombos = combinations(cards, 5);
    for (const combo of fiveCombos) {
        const evald = evaluateFive(combo);
        if (evald.category !== "Royal Flush") continue;
        const comboIds = new Set(combo.map((c) => c.id));
        const leftovers = cards.filter((c) => !comboIds.has(c.id));
        if (leftovers.length !== 2) continue;
        const leftVals = leftovers.map((c) => (isJoker(c) ? 14 : valueOf(c)));
        if (leftVals[0] === leftVals[1]) return true;
    }
    return false;
}

function evaluateFortune(cards: Card[]): FortuneResult {
    if (isNaturalSevenCardStraightFlush(cards)) return { category: "Natural 7 Card S/F", multiplier: FORTUNE_PAYTABLE_1["Natural 7 Card S/F"] };
    if (hasRoyalPlusRM(cards)) return { category: "Royal Flush + R/M", multiplier: FORTUNE_PAYTABLE_1["Royal Flush + R/M"] };
    if (isWildSevenCardStraightFlush(cards)) return { category: "Wild 7 Card S/F", multiplier: FORTUNE_PAYTABLE_1["Wild 7 Card S/F"] };
    const bestFive = combinations(cards, 5).map((combo) => evaluateFive(combo)).sort((a, b) => compareFive(b, a))[0];
    if (bestFive.category === "Five Aces") return { category: "5 Aces", multiplier: FORTUNE_PAYTABLE_1["5 Aces"] };
    if (bestFive.category === "Royal Flush") return { category: "Royal Flush", multiplier: FORTUNE_PAYTABLE_1["Royal Flush"] };
    if (bestFive.category === "Straight Flush") return { category: "Straight Flush", multiplier: FORTUNE_PAYTABLE_1["Straight Flush"] };
    if (bestFive.category === "Quads") return { category: "4 of a Kind", multiplier: FORTUNE_PAYTABLE_1["4 of a Kind"] };
    if (bestFive.category === "Full House") return { category: "Full House", multiplier: FORTUNE_PAYTABLE_1["Full House"] };
    if (bestFive.category === "Flush") return { category: "Flush", multiplier: FORTUNE_PAYTABLE_1["Flush"] };
    if (bestFive.category === "Trips") return { category: "3 of a Kind", multiplier: FORTUNE_PAYTABLE_1["3 of a Kind"] };
    if (bestFive.category === "Straight") return { category: "Straight", multiplier: FORTUNE_PAYTABLE_1["Straight"] };
    if (countSevenCardPairs(cards) === 3) return { category: "Three Pair", multiplier: FORTUNE_PAYTABLE_1["Three Pair"] };
    return { category: "No Fortune", multiplier: -1 };
}

function sidebetRows() {
    return [
        ["Natural 7 Card S/F", 5000],
        ["Royal Flush + R/M", 1000],
        ["Wild 7 Card S/F", 750],
        ["5 Aces", 250],
        ["Royal Flush", 100],
        ["Straight Flush", 50],
        ["4 of a Kind", 20],
        ["Full House", 5],
        ["Flush", 4],
        ["3 of a Kind", 3],
        ["Straight", 2],
        ["Three Pair", "Push"],
    ] as const;
}

// ─── UI constants ─────────────────────────────────────────────────────────────

const CARD_SM = "h-[70px] w-[49px] rounded-[9px] sm:h-[82px] sm:w-[57px] sm:rounded-[11px]";

const CARD_VARIANTS = {
    initial: { opacity: 0, y: -18, scale: 0.94 },
    animate: { opacity: 1, y: 0, scale: 1 },
};

const CARD_TRANSITION = (delay: number) => ({
    duration: 0.32,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    delay,
});

const STACK_GAP = 9;

const ACE_HIGH_ROWS: Array<[string, number]> = [
    ["Both Ace High", 40],
    ["Dealer Ace High + Joker", 15],
    ["Dealer Ace High, No Joker", 5],
];

// ─── UI helpers ───────────────────────────────────────────────────────────────

function toShared(card: Card, faceUp: boolean): SharedCard {
    const rank = card.rank === "JOKER" ? "JOKER" : card.rank === "10" ? "T" : card.rank;
    const suit = card.suit === "🃏" ? "JOKER" : card.suit;
    return { id: card.id, suit: suit as SharedCard["suit"], rank: rank as SharedCard["rank"], faceUp };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChipStack({ chips, onClick }: { chips: ChipDenomination[]; onClick: () => void }) {
    const visible = chips.slice(-3);
    const startIdx = chips.length - visible.length;
    const stackH = 52 + (visible.length > 0 ? (visible.length - 1) * STACK_GAP : 0);
    return (
        <div
            className="relative flex cursor-pointer justify-center"
            style={{ width: 52, height: stackH, marginBottom: -20, zIndex: 10 }}
            onClick={onClick}
        >
            <AnimatePresence>
                {visible.map((denom, i) => {
                    const cfg = CHIP_COLORS[denom];
                    return (
                        <motion.div
                            key={startIdx + i}
                            className="absolute left-0 right-0 mx-auto flex h-[48px] w-[48px] select-none items-center justify-center rounded-full text-[10px] font-extrabold"
                            style={{
                                bottom: i * STACK_GAP, zIndex: i + 1,
                                backgroundColor: cfg.bg, border: `3px solid ${cfg.border}`, color: cfg.text,
                                boxShadow: "inset 0 1px 3px rgba(255,255,255,0.28), inset 0 -1px 2px rgba(0,0,0,0.18), 0 5px 14px rgba(0,0,0,0.5)",
                            }}
                            initial={{ opacity: 0, y: -22, scale: 0.72 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 6, scale: 0.8 }}
                            transition={{ type: "spring", stiffness: 420, damping: 22 }}
                        >
                            {cfg.label}
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}

function BetZone({ chips, totalBet, label, sublabel, size, isSelected, isWinner, onClick, onRemove, canBet }: {
    chips: ChipDenomination[];
    totalBet: number;
    label: string;
    sublabel?: string;
    size: "large" | "small";
    isSelected: boolean;
    isWinner: boolean;
    onClick: () => void;
    onRemove: () => void;
    canBet: boolean;
}) {
    const dim = size === "large" ? 110 : 82;
    const ring = isWinner   ? "border-amber-300/80 shadow-[0_0_28px_rgba(251,191,36,0.35)]"
               : isSelected ? "border-white/60 shadow-[0_0_16px_rgba(255,255,255,0.2)]"
               :              "border-white/30";
    const bg   = isWinner   ? "bg-amber-300/10"
               : isSelected ? "bg-white/10"
               :              "bg-black/20";
    return (
        <div className="flex flex-col items-center">
            {chips.length > 0 ? <ChipStack chips={chips} onClick={onRemove} /> : <div style={{ height: 0 }} />}
            <button
                onClick={onClick}
                disabled={!canBet}
                className={`relative flex flex-col items-center justify-center rounded-full border-2 border-dashed backdrop-blur-sm transition-all duration-200 ${ring} ${bg}`}
                style={{ width: dim, height: dim }}
            >
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/80">{label}</span>
                {sublabel && <span className="mt-0.5 text-[10px] font-normal text-white/45">{sublabel}</span>}
                {totalBet > 0 && (
                    <span className="mt-1 text-[10px] font-extrabold text-amber-200">{formatMoney(totalBet)}</span>
                )}
            </button>
        </div>
    );
}

type PayoutEntry = readonly [string, number | string];

function PayoutColumn({ title, entries, highlight }: {
    title: string;
    entries: ReadonlyArray<PayoutEntry>;
    highlight?: string | null;
}) {
    return (
        <div className="flex flex-col gap-1 pt-2">
            <div className="mb-1 text-center text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-200/70">
                {title}
            </div>
            {entries.map(([hand, pays]) => {
                const isHit = highlight === hand;
                return (
                    <div key={hand} className={`flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[11px] transition ${isHit ? "bg-amber-300/12" : ""}`}>
                        <span className={isHit ? "font-extrabold text-amber-100" : "text-white/45"}>{hand}</span>
                        <span className={`shrink-0 font-bold ${isHit ? "text-amber-300" : "text-white/35"}`}>
                            {typeof pays === "number" ? `${pays}:1` : pays}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

const RULES_SECTIONS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
    ["How the Hand Works", [
        "• You and the dealer each receive 7 cards from a 53-card deck that includes one Joker.",
        "• You split your 7 cards into a 5-card high hand and a 2-card low hand.",
        "• The dealer sets their hand using house-way rules.",
        "• Your high hand must outrank your low hand or the split is illegal.",
    ]],
    ["The Joker", [
        "• The Joker is semi-wild. It can complete a straight, flush, straight flush, or royal flush.",
        "• Otherwise it plays as an Ace.",
        "• In the low (2-card) hand, the Joker always counts as an Ace.",
    ]],
    ["Winning", [
        "• Win both hands: your main bet wins even money.",
        "• Win one hand, lose one hand: push, main bet returned.",
        "• Lose both hands: main bet lost.",
        "• Dealer wins all ties on both hands.",
    ]],
    ["Auto Set Best", [
        "• Pressing Auto Set Best calculates the split that gives you the best possible outcome against the dealer's revealed hand.",
        "• The outcome check indicator shows whether your current split matches, beats, or falls short of that optimal outcome.",
    ]],
    ["Fortune Bonus", [
        "• The Fortune side bet pays based on the best 5-card hand in your 7 cards, regardless of how you set the hand.",
        "• Three Pair pushes (returns your bet).",
        "• All other qualifying hands pay as shown in the payout table.",
    ]],
    ["Ace High Side Bet", [
        "• Pays when the dealer has an ace-high pai gow (no pair or better in their 7 cards).",
        "• Dealer ace-high without joker pays 5 to 1.",
        "• Dealer ace-high with joker pays 15 to 1.",
        "• Both player and dealer ace-high pays 40 to 1.",
        "• Note: a pair of Aces (even with a joker) does not qualify — the dealer must have no pair at all in their 7 cards.",
    ]],
] as const;

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
                    initial={{ opacity: 0, y: 24, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 16, scale: 0.98 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="relative z-[101] max-h-[88dvh] w-full max-w-[860px] overflow-hidden rounded-[1.5rem] border border-amber-300/20 bg-[linear-gradient(180deg,_rgba(7,20,14,0.98),_rgba(3,10,7,0.98))] text-white shadow-[0_20px_70px_rgba(0,0,0,0.6)]"
                >
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4">
                        <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-amber-200/90 sm:text-[11px]">Help</div>
                            <div className="mt-1 text-lg font-extrabold text-amber-50 sm:text-2xl">Pai Gow Poker Rules</div>
                        </div>
                        <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl font-bold text-white/85 transition hover:bg-white/10">×</button>
                    </div>
                    <div className="max-h-[calc(88dvh-76px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                        <div className="space-y-4 text-sm leading-6 text-emerald-50/90">
                            {RULES_SECTIONS.map(([title, items]) => (
                                <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                    <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-200">{title}</div>
                                    <div className="space-y-1">{items.map((s) => <div key={s}>{s}</div>)}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

function TableLabel({ onRules }: { onRules: () => void }) {
    return (
        <div className="mb-3 flex shrink-0 select-none flex-col items-center gap-1">
            <div className="flex items-center gap-2">
                <h1
                    className="text-xl font-extrabold uppercase tracking-[0.16em] text-amber-100/90"
                    style={{ fontFamily: "Georgia, serif", textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}
                >
                    Face-up Pai Gow Poker
                </h1>
                <button
                    onClick={onRules}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-300/30 bg-black/25 text-[11px] font-extrabold text-amber-100 transition hover:bg-amber-300/15"
                    aria-label="Show rules"
                >
                    i
                </button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[10px] font-bold tracking-[0.15em] text-white/35">
                <span>7 CARDS · SPLIT INTO 5-CARD HIGH AND 2-CARD LOW</span>
                <span className="text-white/20">·</span>
                <span>DEALER TIES WIN</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[10px] font-bold tracking-[0.12em] text-white/25">
                <span>WIN BOTH = EVEN MONEY</span>
                <span className="text-white/15">·</span>
                <span>SPLIT = PUSH</span>
                <span className="text-white/15">·</span>
                <span>LOSE BOTH = LOSE</span>
            </div>
        </div>
    );
}

function PaiGowBar({
    stage, selectedChip, selectedIsLegal, selectedFrontIds,
    onChipSelect, onDeal, onAutoSetBest, onSetHand, onNextHand,
}: {
    stage: Stage;
    selectedChip: ChipDenomination;
    selectedIsLegal: boolean;
    selectedFrontIds: string[];
    onChipSelect: (c: ChipDenomination) => void;
    onDeal: () => void;
    onAutoSetBest: () => void;
    onSetHand: () => void;
    onNextHand: () => void;
}) {
    return (
        <div className="flex flex-col gap-2 border-t border-white/10 bg-black/55 px-4 py-3 backdrop-blur-xl sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3">
            <ChipTray selectedChip={selectedChip} onSelect={onChipSelect} disabled={stage !== "betting"} />
            <div className="flex items-center justify-center gap-2">
                <AnimatePresence mode="popLayout" initial={false}>
                    {stage === "betting" && (
                        <SlideBtn key="deal">
                            <button className={BTN_GOLD} onClick={onDeal}>Deal</button>
                        </SlideBtn>
                    )}
                    {stage === "setting" && (
                        <SlideBtn key="auto">
                            <button className={BTN_NEUTRAL} onClick={onAutoSetBest}>Auto Set Best</button>
                        </SlideBtn>
                    )}
                    {stage === "setting" && (
                        <SlideBtn key="set">
                            <button
                                className={BTN_GOLD}
                                onClick={onSetHand}
                                disabled={!selectedIsLegal || selectedFrontIds.length !== 2}
                            >
                                Set Hand
                            </button>
                        </SlideBtn>
                    )}
                    {stage === "showdown" && (
                        <SlideBtn key="next">
                            <button className={BTN_GREEN} onClick={onNextHand}>Next Hand</button>
                        </SlideBtn>
                    )}
                </AnimatePresence>
            </div>
            <div className="invisible hidden sm:block" aria-hidden>
                <ChipTray selectedChip={selectedChip} onSelect={() => {}} disabled />
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PaiGowPoker({ bankroll, setBankroll }: Props) {
    // ── Game state (preserved) ────────────────────────────────────────────────
    const [stage, setStage] = useState<Stage>("betting");
    const [message, setMessage] = useState("Set your wagers and press Deal.");

    const [mainBet, setMainBet] = useState(25);
    const [fortuneBet, setFortuneBet] = useState(5);
    const [aceHighBet, setAceHighBet] = useState(5);

    const [playerCards, setPlayerCards] = useState<Card[]>([]);
    const [dealerCards, setDealerCards] = useState<Card[]>([]);
    const [selectedFrontIds, setSelectedFrontIds] = useState<string[]>([]);

    const [wagerAtDeal, setWagerAtDeal] = useState(0);
    const [resultLines, setResultLines] = useState<string[]>([]);
    const [net, setNet] = useState<number | null>(null);

    // ── UI state ──────────────────────────────────────────────────────────────
    const [showRules, setShowRules] = useState(false);
    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(25);
    const [selectedSpot, setSelectedSpot] = useState<BetSpot | null>(null);
    const [mainChips, setMainChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(25));
    const [fortuneChips, setFortuneChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(5));
    const [aceHighChips, setAceHighChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(5));

    // Rebuild chip stacks whenever we return to betting (e.g. after Next Hand)
    useEffect(() => {
        if (stage === "betting") {
            setMainChips(buildChipStackFromAmount(mainBet));
            setFortuneChips(buildChipStackFromAmount(fortuneBet));
            setAceHighChips(buildChipStackFromAmount(aceHighBet));
            setSelectedSpot(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage]);

    // ── Game useMemo (preserved) ──────────────────────────────────────────────
    const dealerBestSplit = useMemo(() => {
        if (dealerCards.length !== 7) return null;
        return evaluateDealerHouseWay(dealerCards);
    }, [dealerCards]);

    const bestPlayerSplitAgainstDealer = useMemo(() => {
        if (playerCards.length !== 7 || !dealerBestSplit) return null;
        return evaluateBestSplitAgainstDealer(playerCards, dealerBestSplit);
    }, [playerCards, dealerBestSplit]);

    const selectedFront = useMemo(() => {
        const set = new Set(selectedFrontIds);
        return playerCards.filter((c) => set.has(c.id));
    }, [playerCards, selectedFrontIds]);

    const selectedBack = useMemo(() => {
        const set = new Set(selectedFrontIds);
        return playerCards.filter((c) => !set.has(c.id));
    }, [playerCards, selectedFrontIds]);

    const currentFrontEval = useMemo(() => {
        if (selectedFront.length !== 2) return null;
        return evaluateFront(selectedFront);
    }, [selectedFront]);

    const currentBackEval = useMemo(() => {
        if (selectedBack.length !== 5) return null;
        return evaluateFive(selectedBack);
    }, [selectedBack]);

    const selectedIsLegal = useMemo(() => {
        if (!currentFrontEval || !currentBackEval) return false;
        return isLegalSplit(currentBackEval, currentFrontEval);
    }, [currentFrontEval, currentBackEval]);

    const selectedIsExactBest = useMemo(() => {
        if (!bestPlayerSplitAgainstDealer || selectedFrontIds.length !== 2) return false;
        const key = [...selectedFrontIds].sort().join("|");
        return bestPlayerSplitAgainstDealer.allBestFrontKeySet.has(key);
    }, [bestPlayerSplitAgainstDealer, selectedFrontIds]);

    const selectedMatchesBestOutcome = useMemo(() => {
        if (!bestPlayerSplitAgainstDealer || !dealerBestSplit || !currentFrontEval || !currentBackEval || !selectedIsLegal) return false;
        const bestBackCmp = compareFive(bestPlayerSplitAgainstDealer.best.backEval, dealerBestSplit.backEval);
        const bestFrontCmp = compareFront(bestPlayerSplitAgainstDealer.best.frontEval, dealerBestSplit.frontEval);
        const selectedBackCmp = compareFive(currentBackEval, dealerBestSplit.backEval);
        const selectedFrontCmp = compareFront(currentFrontEval, dealerBestSplit.frontEval);
        const getOutcomeTier = (backCmp: number, frontCmp: number) => {
            const wins = (backCmp > 0 ? 1 : 0) + (frontCmp > 0 ? 1 : 0);
            const losses = (backCmp <= 0 ? 1 : 0) + (frontCmp <= 0 ? 1 : 0);
            if (wins === 2) return 2;
            if (wins === 1 && losses === 1) return 1;
            return 0;
        };
        return getOutcomeTier(selectedBackCmp, selectedFrontCmp) === getOutcomeTier(bestBackCmp, bestFrontCmp);
    }, [bestPlayerSplitAgainstDealer, dealerBestSplit, currentFrontEval, currentBackEval, selectedIsLegal]);

    const fortunePreview = useMemo(() => {
        if (playerCards.length !== 7) return null;
        return evaluateFortune(playerCards);
    }, [playerCards]);

    const playerAceHighInfo = useMemo(() => {
        if (playerCards.length !== 7) return null;
        return getHighPaiGowInfo(playerCards);
    }, [playerCards]);

    const dealerAceHighInfo = useMemo(() => {
        if (dealerCards.length !== 7) return null;
        return getHighPaiGowInfo(dealerCards);
    }, [dealerCards]);

    // ── Game handlers (preserved) ─────────────────────────────────────────────
    function toggleFront(cardId: string) {
        if (stage !== "setting") return;
        setSelectedFrontIds((prev) => {
            if (prev.includes(cardId)) return prev.filter((id) => id !== cardId);
            if (prev.length >= 2) return [prev[1], cardId];
            return [...prev, cardId];
        });
    }

    function autoSetBest() {
        if (!bestPlayerSplitAgainstDealer) return;
        setSelectedFrontIds(bestPlayerSplitAgainstDealer.best.front.map((c) => c.id));
        setMessage("Best high/low hand set against dealer selected.");
    }

    function dealHand() {
        const normalizedMain = clampBet(mainBet, MAIN_MIN);
        const normalizedFortune = Math.max(SIDE_MIN, clampBet(fortuneBet, SIDE_MIN));
        const normalizedAceHigh = Math.max(SIDE_MIN, clampBet(aceHighBet, SIDE_MIN));
        const total = normalizedMain + normalizedFortune + normalizedAceHigh;
        if (bankroll < total) { setMessage("Not enough bankroll for those wagers."); return; }
        const freshDeck = createDeck();
        let next = freshDeck;
        let p: Card[]; let d: Card[];
        [p, next] = draw(next, 7);
        [d, next] = draw(next, 7);
        setMainBet(normalizedMain);
        setFortuneBet(normalizedFortune);
        setAceHighBet(normalizedAceHigh);
        setWagerAtDeal(total);
        setBankroll((b) => b - total);
        setPlayerCards(p);
        setDealerCards(d);
        setSelectedFrontIds([]);
        setStage("setting");
        setResultLines([]);
        setNet(null);
        setMessage("Dealer sets first. Their hand is live on the table. Pick 2 cards for your low hand, or press Auto Set Best.");
    }

    function setHandAndResolve() {
        if (!bestPlayerSplitAgainstDealer || !dealerBestSplit) return;
        if (selectedFrontIds.length !== 2) { setMessage("Pick exactly 2 cards for the low hand."); return; }
        if (!selectedIsLegal) { setMessage("That hand is illegal."); return; }
        const playerSplit = buildSplit(selectedFront, playerCards);
        const dealerSplit = dealerBestSplit;
        const backCmp = compareFive(playerSplit.backEval, dealerSplit.backEval);
        const frontCmp = compareFront(playerSplit.frontEval, dealerSplit.frontEval);
        let mainReturn = 0;
        const lines: string[] = [];
        const playerWinsBack = backCmp > 0; const dealerWinsBack = backCmp <= 0;
        const playerWinsFront = frontCmp > 0; const dealerWinsFront = frontCmp <= 0;
        if (playerWinsBack && playerWinsFront) {
            mainReturn += mainBet * 2;
            lines.push("Player wins both hands. Main bet wins 1 to 1.");
        } else if (dealerWinsBack && dealerWinsFront) {
            lines.push("Dealer wins both hands. Main bet loses.");
        } else {
            mainReturn += mainBet;
            lines.push("Push. One hand each.");
        }
        if (fortuneBet > 0 && fortunePreview) {
            if (fortunePreview.multiplier > 0) {
                const win = fortuneBet * fortunePreview.multiplier;
                mainReturn += fortuneBet + win;
                lines.push(`Fortune wins ${fortunePreview.multiplier} to 1 on ${fortunePreview.category}.`);
            } else if (fortunePreview.category === "Three Pair") {
                mainReturn += fortuneBet;
                lines.push("Fortune pushes on Three Pair.");
            } else {
                lines.push("Fortune loses.");
            }
        }
        if (aceHighBet > 0 && dealerAceHighInfo && playerAceHighInfo) {
            if (dealerAceHighInfo.aceHigh && playerAceHighInfo.aceHigh) {
                mainReturn += aceHighBet + aceHighBet * ACE_HIGH_PAYTABLE.bothAceHigh;
                lines.push(`Ace High wins ${ACE_HIGH_PAYTABLE.bothAceHigh} to 1. Both player and dealer have ace-high pai gow.`);
            } else if (dealerAceHighInfo.aceHigh && dealerAceHighInfo.hasJoker) {
                mainReturn += aceHighBet + aceHighBet * ACE_HIGH_PAYTABLE.dealerAceHighWithJoker;
                lines.push(`Ace High wins ${ACE_HIGH_PAYTABLE.dealerAceHighWithJoker} to 1. Dealer has ace-high with joker.`);
            } else if (dealerAceHighInfo.aceHigh && !dealerAceHighInfo.hasJoker) {
                mainReturn += aceHighBet + aceHighBet * ACE_HIGH_PAYTABLE.dealerAceHighNoJoker;
                lines.push(`Ace High wins ${ACE_HIGH_PAYTABLE.dealerAceHighNoJoker} to 1. Dealer has ace-high without joker.`);
            } else {
                lines.push("Ace High loses.");
            }
        }
        setBankroll((b) => b + mainReturn);
        setNet(mainReturn - wagerAtDeal);
        setResultLines(lines);
        setStage("showdown");
        setMessage("Showdown complete.");
    }

    function nextHand() {
        setPlayerCards([]);
        setDealerCards([]);
        setSelectedFrontIds([]);
        setWagerAtDeal(0);
        setResultLines([]);
        setNet(null);
        setStage("betting");
        setMessage("Set your wagers and press Deal.");
    }

    // ── UI chip handlers ──────────────────────────────────────────────────────
    const canBet = stage === "betting";

    const addChip = (spot: BetSpot, chip: ChipDenomination) => {
        if (!canBet) return;
        if (spot === "main") { setMainBet((b) => b + chip); setMainChips((s) => [...s, chip]); }
        else if (spot === "fortune") { setFortuneBet((b) => b + chip); setFortuneChips((s) => [...s, chip]); }
        else { setAceHighBet((b) => b + chip); setAceHighChips((s) => [...s, chip]); }
    };

    const clearSpot = (spot: BetSpot) => {
        if (!canBet) return;
        if (spot === "main") { setMainBet(MAIN_MIN); setMainChips(buildChipStackFromAmount(MAIN_MIN)); }
        else if (spot === "fortune") { setFortuneBet(0); setFortuneChips([]); }
        else { setAceHighBet(0); setAceHighChips([]); }
    };

    const handleChipSelect = (chip: ChipDenomination) => {
        setSelectedChip(chip);
        if (canBet && selectedSpot) addChip(selectedSpot, chip);
    };

    const handleZoneClick = (spot: BetSpot) => {
        if (!canBet) return;
        if (selectedSpot === spot) addChip(spot, selectedChip);
        else setSelectedSpot(spot);
    };

    // ── Derived render values ─────────────────────────────────────────────────
    const selectedSet = new Set(selectedFrontIds);
    const showDealerSet = stage === "setting" || stage === "showdown";
    const playerHasStartedSetting = selectedFrontIds.length > 0;

    const displayWager = stage === "betting"
        ? mainBet + (fortuneBet > 0 ? fortuneBet : 0) + (aceHighBet > 0 ? aceHighBet : 0)
        : wagerAtDeal;

    const mainWon = stage === "showdown" && resultLines.some((l) => l.includes("wins both hands"));
    const fortuneWon = stage === "showdown" && fortuneBet > 0 && fortunePreview !== null && fortunePreview.multiplier > 0;
    const aceHighWon = stage === "showdown" && aceHighBet > 0 && !!(dealerAceHighInfo?.aceHigh);

    const fortuneHighlight =
        (stage === "setting" || stage === "showdown") && fortunePreview && fortunePreview.category !== "No Fortune"
            ? fortunePreview.category
            : null;

    const aceHighHighlight: string | null =
        stage === "showdown" && aceHighBet > 0
            ? dealerAceHighInfo?.aceHigh && playerAceHighInfo?.aceHigh
                ? "Both Ace High"
                : dealerAceHighInfo?.aceHigh && dealerAceHighInfo?.hasJoker
                    ? "Dealer Ace High + Joker"
                    : dealerAceHighInfo?.aceHigh
                        ? "Dealer Ace High, No Joker"
                        : null
            : null;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <>
            <RulesModal open={showRules} onClose={() => setShowRules(false)} />
            <TableShell
                feltColor="#1a5c2e"
                gameName="Pai Gow Poker"
                bankroll={bankroll}
                hideHeader
                actionBar={
                    <PaiGowBar
                        stage={stage}
                        selectedChip={selectedChip}
                        selectedIsLegal={selectedIsLegal}
                        selectedFrontIds={selectedFrontIds}
                        onChipSelect={handleChipSelect}
                        onDeal={dealHand}
                        onAutoSetBest={autoSetBest}
                        onSetHand={setHandAndResolve}
                        onNextHand={nextHand}
                    />
                }
            >
                <TableLabel onRules={() => setShowRules(true)} />

                <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:overflow-hidden lg:px-6">

                    {/* ── LEFT: betting ──────────────────────────────────── */}
                    <div className="flex w-full flex-col items-center justify-center gap-4 px-4 py-2 lg:w-64 lg:shrink-0">

                        {/* Wager / Net bar */}
                        <div className="flex w-full items-center justify-center gap-4 rounded-xl border border-white/10 bg-black/30 px-4 py-2">
                            <div className="text-center">
                                <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">On Table</div>
                                <div className="text-sm font-extrabold text-white">{displayWager > 0 ? formatMoney(displayWager) : "—"}</div>
                            </div>
                            {stage === "showdown" && net !== null && (
                                <>
                                    <div className="h-5 w-px bg-white/10" />
                                    <div className="text-center">
                                        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Net</div>
                                        <div className={`text-sm font-extrabold ${net > 0 ? "text-emerald-300" : net < 0 ? "text-red-400" : "text-amber-100"}`}>
                                            {net >= 0 ? "+" : ""}{formatMoney(net)}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Side bet circles */}
                        <div className="flex items-end gap-6">
                            <BetZone
                                chips={fortuneChips} totalBet={fortuneBet}
                                label="Fortune" sublabel="optional"
                                size="small"
                                isSelected={selectedSpot === "fortune"}
                                isWinner={fortuneWon}
                                canBet={canBet}
                                onClick={() => handleZoneClick("fortune")}
                                onRemove={() => clearSpot("fortune")}
                            />
                            <BetZone
                                chips={aceHighChips} totalBet={aceHighBet}
                                label="Ace High" sublabel="optional"
                                size="small"
                                isSelected={selectedSpot === "aceHigh"}
                                isWinner={aceHighWon}
                                canBet={canBet}
                                onClick={() => handleZoneClick("aceHigh")}
                                onRemove={() => clearSpot("aceHigh")}
                            />
                        </div>

                        {/* Main bet circle */}
                        <BetZone
                            chips={mainChips} totalBet={mainBet}
                            label="Main" sublabel={`min $${MAIN_MIN}`}
                            size="large"
                            isSelected={selectedSpot === "main"}
                            isWinner={mainWon}
                            canBet={canBet}
                            onClick={() => handleZoneClick("main")}
                            onRemove={() => clearSpot("main")}
                        />

                        {/* Fortune preview during setting */}
                        {stage === "setting" && fortunePreview && fortunePreview.category !== "No Fortune" && (
                            <p className="text-center text-[11px] font-semibold text-amber-300">
                                Fortune: {fortunePreview.category}
                            </p>
                        )}

                        {/* Result lines during showdown */}
                        {stage === "showdown" && resultLines.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25 }}
                                className="flex flex-col items-center gap-1 text-center"
                            >
                                {resultLines.map((line, i) => (
                                    <p key={i} className="text-[11px] leading-snug text-white/55">{line}</p>
                                ))}
                            </motion.div>
                        )}
                    </div>

                    {/* ── CENTER: cards ───────────────────────────────────── */}
                    <div className="flex w-full flex-col items-center gap-3 py-2 lg:flex-1">

                        {/* Dealer section */}
                        {dealerCards.length > 0 && (
                            <div className="flex flex-col items-center gap-2">
                                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Dealer</span>
                                <div className="flex flex-wrap justify-center gap-1.5">
                                    <AnimatePresence initial={false}>
                                        {dealerCards.map((card, i) => (
                                            <motion.div
                                                key={card.id}
                                                variants={CARD_VARIANTS}
                                                initial="initial"
                                                animate="animate"
                                                transition={CARD_TRANSITION(i * 0.05)}
                                            >
                                                <PlayingCard card={toShared(card, true)} className={CARD_SM} />
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>

                                {showDealerSet && dealerBestSplit && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.22 }}
                                        className="flex flex-col gap-3 sm:flex-row sm:gap-6"
                                    >
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30">Dealer High</span>
                                            <div className="flex gap-1">
                                                {dealerBestSplit.back.map((c) => (
                                                    <PlayingCard key={`db-${c.id}`} card={toShared(c, true)} className={CARD_SM} />
                                                ))}
                                            </div>
                                            <span className="text-[11px] font-semibold text-amber-100/65">{dealerBestSplit.backEval.label}</span>
                                        </div>
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30">Dealer Low</span>
                                            <div className="flex gap-1">
                                                {dealerBestSplit.front.map((c) => (
                                                    <PlayingCard key={`df-${c.id}`} card={toShared(c, true)} className={CARD_SM} />
                                                ))}
                                            </div>
                                            <span className="text-[11px] font-semibold text-amber-100/65">{dealerBestSplit.frontEval.label}</span>
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        )}

                        {/* Divider */}
                        {dealerCards.length > 0 && playerCards.length > 0 && (
                            <div className="h-px w-full max-w-md bg-white/8 shrink-0" />
                        )}

                        {/* Player section */}
                        {playerCards.length > 0 && (
                            <div className="flex flex-col items-center gap-2">
                                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Player</span>

                                {/* 7 clickable cards */}
                                <div className="flex flex-wrap justify-center gap-1.5">
                                    <AnimatePresence initial={false}>
                                        {playerCards.map((card, i) => (
                                            <motion.button
                                                key={card.id}
                                                onClick={() => toggleFront(card.id)}
                                                disabled={stage !== "setting"}
                                                variants={CARD_VARIANTS}
                                                initial="initial"
                                                animate="animate"
                                                transition={CARD_TRANSITION(i * 0.05)}
                                                whileHover={stage === "setting" ? { y: -3 } : undefined}
                                                whileTap={stage === "setting" ? { scale: 0.97 } : undefined}
                                                className={`shrink-0 rounded-[9px] transition-transform duration-150 ${
                                                    selectedSet.has(card.id)
                                                        ? "-translate-y-2 ring-2 ring-amber-400/80 ring-offset-1 ring-offset-black/50"
                                                        : ""
                                                }`}
                                            >
                                                <PlayingCard card={toShared(card, true)} className={CARD_SM} />
                                            </motion.button>
                                        ))}
                                    </AnimatePresence>
                                </div>

                                {/* Illegal split warning */}
                                {playerHasStartedSetting && selectedFrontIds.length === 2 && !selectedIsLegal && (
                                    <p className="text-[11px] font-bold text-red-400">Illegal — high hand must beat low hand</p>
                                )}

                                {/* Player split display */}
                                <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30">High (5)</span>
                                        {!playerHasStartedSetting ? (
                                            <span className="text-[11px] italic text-white/20">Not set</span>
                                        ) : (
                                            <>
                                                <div className="flex gap-1">
                                                    {selectedBack.map((c) => (
                                                        <PlayingCard key={`pb-${c.id}`} card={toShared(c, true)} className={CARD_SM} />
                                                    ))}
                                                </div>
                                                <span className="text-[11px] font-semibold text-amber-100/65">
                                                    {currentBackEval?.label ?? "—"}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30">Low (2)</span>
                                        {!playerHasStartedSetting ? (
                                            <span className="text-[11px] italic text-white/20">Pick 2 cards</span>
                                        ) : (
                                            <>
                                                <div className="flex gap-1">
                                                    {selectedFront.map((c) => (
                                                        <PlayingCard key={`pf-${c.id}`} card={toShared(c, true)} className={CARD_SM} />
                                                    ))}
                                                </div>
                                                <span className="text-[11px] font-semibold text-amber-100/65">
                                                    {currentFrontEval?.label ?? "Select 2"}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Outcome quality indicator */}
                                {playerHasStartedSetting && selectedFrontIds.length === 2 && selectedIsLegal && (
                                    <div className="flex items-center gap-2 text-[11px]">
                                        <span className="font-bold text-emerald-400">Legal split</span>
                                        <span className="text-white/20">·</span>
                                        <span className={
                                            selectedIsExactBest ? "font-bold text-emerald-300"
                                            : selectedMatchesBestOutcome ? "font-bold text-amber-300"
                                            : "text-white/40"
                                        }>
                                            {selectedIsExactBest
                                                ? "Exact best"
                                                : selectedMatchesBestOutcome
                                                    ? "Same best outcome"
                                                    : "Sub-optimal"}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Message */}
                        <p className="text-sm font-semibold text-amber-50/60">{message}</p>
                    </div>

                    {/* ── RIGHT: payout tables ────────────────────────────── */}
                    <div className="hidden w-72 shrink-0 flex-col justify-center lg:flex">
                        <PayoutColumn
                            title="Fortune Bonus"
                            entries={sidebetRows()}
                            highlight={fortuneHighlight}
                        />
                        <div className="mt-5">
                            <PayoutColumn
                                title="Ace High Side Bet"
                                entries={ACE_HIGH_ROWS}
                                highlight={aceHighHighlight}
                            />
                        </div>
                    </div>

                </div>
            </TableShell>
        </>
    );
}
