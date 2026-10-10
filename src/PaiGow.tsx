import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import TableShell from "./shared/TableShell";
import ChipTray from "./shared/ChipTray";
import PlayingCard from "./shared/Card";
import type { Card as SharedCard } from "./shared/cards";
import { type ChipDenomination, buildChipStackFromAmount, popLastChip, BTN_NEUTRAL, BTN_GOLD } from "./shared/money";
import BetSpot, { BetBar } from "./shared/BetSpot";
import { sortByPower, type SortMode } from "./shared/handSort";
import { SlideBtn } from "./shared/SlideBtn";
import { defaultBet } from "./shared/settings";

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

type BetSpotId = "main" | "fortune" | "aceHigh";

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

// No pair anywhere in the seven cards. A joker beside an ace counts as a pair of aces.
function hasNoPair(cards: Card[]) {
    const values = cards.filter((c) => !isJoker(c)).map((c) => valueOf(c));
    if (new Set(values).size !== values.length) return false;
    return !(cards.some(isJoker) && values.includes(14));
}

// A no-pair hand that holds a straight or flush keeps it in the High hand, with the two
// highest cards that still leave it whole in the Low hand. Breaking it up to play high cards
// in front hands the player the High hand almost every time.
function keepMadeHandSplit(cards: Card[]): SplitEval | null {
    let best: SplitEval | null = null; let bestScore: number[] | null = null;
    for (const front of combinations(cards, 2)) {
        const split = buildSplit(front, cards);
        if (!isLegalSplit(split.backEval, split.frontEval) || getBackHouseWayTier(split.backEval) < 2) continue;
        const score = [...split.frontEval.score, ...split.backEval.score];
        if (!best || !bestScore || compareVectors(score, bestScore) > 0) { best = split; bestScore = score; }
    }
    return best;
}

function evaluateDealerHouseWay(cards: Card[]): SplitEval {
    if (hasNoPair(cards)) {
        const made = keepMadeHandSplit(cards);
        if (made) return made;
    }
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

// Dealer reveal: steps 1-7 turn the dealer's cards one at a time, step 8 sets them into High / Low
const DEALER_SET = 8;

// Cards sit in absolutely placed slots so a single card can slide between rows.
// --cw / --ch are the card width / height set on the stack container.
const STACK_VARS = "[--cw:49px] [--ch:70px] sm:[--cw:57px] sm:[--ch:82px]";
const SLOT_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function slotStyle(row: number, col: number, count: number, rowStep: number, z: number): React.CSSProperties {
    // cards tighten up on narrow screens instead of wrapping
    const step = `min(calc(var(--cw) + 6px), calc((100% - var(--cw)) / ${Math.max(count - 1, 1)}))`;
    return {
        position: "absolute",
        left: `calc(50% - var(--cw) / 2 + ${col - (count - 1) / 2} * ${step})`,
        top: `calc(var(--ch) * ${row * rowStep})`,
        zIndex: z,
        transition: `left 0.4s ${SLOT_EASE}, top 0.4s ${SLOT_EASE}`,
    };
}

// How far the second row sits below the first, as a share of card height.
// Less than 1 so the hands overlap like a stack on a real table.
const DEALER_ROW_STEP = 0.62;
const PLAYER_ROW_STEP = 0.78;

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

type PayoutEntry = readonly [string, number | string];

function PayoutColumn({ title, entries, highlight }: {
    title: string;
    entries: ReadonlyArray<PayoutEntry>;
    highlight?: string | null;
}) {
    return (
        <div className="flex flex-col gap-1 pt-2">
            <div className="mb-1 text-center text-[13px] font-extrabold text-amber-200">
                {title}
            </div>
            {entries.map(([hand, pays]) => {
                const isHit = highlight === hand;
                return (
                    <div key={hand} className={`flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[11px] transition ${isHit ? "bg-amber-300/12" : ""}`}>
                        <span className={isHit ? "font-extrabold text-amber-100" : "text-white/75"}>{hand}</span>
                        <span className={`shrink-0 font-bold text-gold`}>
                            {typeof pays === "number" ? `${pays} to 1` : pays}
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
        "• If the dealer has an Ace-high pai gow (no pair or better), the main bet pushes automatically.",
    ]],
    ["Ask Dealer for Help", [
        "• Pressing Ask Dealer for Help calculates the split that gives you the best possible outcome against the dealer's revealed hand.",
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
                <button className="absolute inset-0 bg-black/80" onClick={onClose} aria-label="Close rules modal" />
                <motion.div
                    initial={{ opacity: 0, y: 24, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 16, scale: 0.98 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="relative z-[101] max-h-[88dvh] w-full max-w-[860px] overflow-hidden rounded-[4px] border border-[#5a8a69] bg-[#0a2311] text-text"
                >
                    <div className="flex items-center justify-between border-b border-[#5a8a69] px-4 py-3 sm:px-5 sm:py-4">
                        <div>
                            <div className="text-[13px] font-extrabold text-amber-200/90">Help</div>
                            <div className="mt-1 text-xl font-bold tracking-[-0.01em] text-gold-soft">Pai Gow Poker Rules</div>
                        </div>
                        <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-[#5a8a69] bg-[#10391d] text-xl font-bold text-text transition-colors hover:bg-[#154a25] active:bg-[#0a2311]">×</button>
                    </div>
                    <div className="max-h-[calc(88dvh-76px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                        <div className="space-y-4 text-base leading-6 text-text">
                            {RULES_SECTIONS.map(([title, items]) => (
                                <div key={title} className="rounded-[4px] border border-[#5a8a69] bg-[#10391d] p-4">
                                    <div className="mb-2 text-sm font-extrabold text-amber-200">{title}</div>
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
                    className="text-center text-2xl font-bold text-gold-soft"
                >
                    Face-up Pai Gow Poker
                </h1>
                <button
                    onClick={onRules}
                    className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-gold-deep bg-ink text-sm font-bold text-gold-soft transition-colors hover:bg-panel-2 active:bg-black"
                    aria-label="Show rules"
                >
                    i
                </button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-sm font-semibold text-white/75">
                <span>7 CARDS · SPLIT INTO 5-CARD HIGH AND 2-CARD LOW</span>
                <span className="text-white/75">·</span>
                <span>Dealer ties win</span>
                <span className="text-white/75">·</span>
                <span>DEALER ACE HIGH PUSHES</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-sm font-semibold text-white/75">
                <span>Win both = even money</span>
                <span className="text-white/75">·</span>
                <span>Split = push</span>
                <span className="text-white/75">·</span>
                <span>Lose both = lose</span>
            </div>
        </div>
    );
}

function PaiGowBar({
    stage, selectedChip, selectedIsLegal, selectedFrontIds, canRebet, dealerSetting, playerReady, autoFinishing,
    onRevealAll, onChipSelect, onDeal, onAutoSetBest, onSetHand, onClear, onChangeBet,
}: {
    stage: Stage;
    selectedChip: ChipDenomination;
    selectedIsLegal: boolean;
    selectedFrontIds: string[];
    canRebet: boolean;
    dealerSetting: boolean;
    playerReady: boolean;
    /** Dealer has Ace-high: once the player's cards are up the table sets them and ends the hand. */
    autoFinishing: boolean;
    onRevealAll: () => void;
    onChipSelect: (c: ChipDenomination) => void;
    onDeal: () => void;
    onAutoSetBest: () => void;
    onSetHand: () => void;
    onClear: () => void;
    onChangeBet: () => void;
}) {
    return (
        <div className="flex flex-col gap-2 border-t border-line bg-ink px-4 py-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3">
            <ChipTray selectedChip={selectedChip} onSelect={onChipSelect} disabled={stage !== "betting"} />
            <div className="flex items-center justify-center gap-2">
                <AnimatePresence mode="popLayout" initial={false}>
                    {stage === "betting" && (
                        <SlideBtn key="clear">
                            <button className={BTN_NEUTRAL} onClick={onClear}>Clear</button>
                        </SlideBtn>
                    )}
                    {stage === "betting" && (
                        <SlideBtn key="deal">
                            <button className={BTN_GOLD} onClick={onDeal}>Deal</button>
                        </SlideBtn>
                    )}
                    {stage === "setting" && !playerReady && (
                        <SlideBtn key="reveal">
                            <button className={BTN_GOLD} onClick={onRevealAll} disabled={dealerSetting}>Reveal Cards</button>
                        </SlideBtn>
                    )}
                    {stage === "setting" && !autoFinishing && playerReady && (
                        <SlideBtn key="auto">
                            <button className={BTN_NEUTRAL} onClick={onAutoSetBest}>Ask Dealer for Help</button>
                        </SlideBtn>
                    )}
                    {stage === "setting" && !autoFinishing && playerReady && (
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
                        <SlideBtn key="clear-done">
                            <button className={BTN_NEUTRAL} onClick={onClear}>Clear</button>
                        </SlideBtn>
                    )}
                    {stage === "showdown" && (
                        <SlideBtn key="change-bet">
                            <button className={BTN_NEUTRAL} onClick={onChangeBet}>Change Bet</button>
                        </SlideBtn>
                    )}
                    {stage === "showdown" && (
                        <SlideBtn key="rebet">
                            <button className={BTN_GOLD} onClick={onDeal} disabled={!canRebet}>Rebet &amp; Deal</button>
                        </SlideBtn>
                    )}
                </AnimatePresence>
            </div>
            <div className="invisible hidden sm:block">
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

    const [mainBet, setMainBet] = useState(() => defaultBet("paigow", "main"));
    const [fortuneBet, setFortuneBet] = useState(() => defaultBet("paigow", "fortune"));
    const [aceHighBet, setAceHighBet] = useState(() => defaultBet("paigow", "aceHigh"));

    const [playerCards, setPlayerCards] = useState<Card[]>([]);
    const [dealerCards, setDealerCards] = useState<Card[]>([]);
    const [selectedFrontIds, setSelectedFrontIds] = useState<string[]>([]);

    const [wagerAtDeal, setWagerAtDeal] = useState(0);
    const [resultLines, setResultLines] = useState<string[]>([]);
    const [net, setNet] = useState<number | null>(null);
    const [roundReturned, setRoundReturned] = useState(0);

    // ── UI state ──────────────────────────────────────────────────────────────
    const [showRules, setShowRules] = useState(false);
    const [selectedChip, setSelectedChip] = useState<ChipDenomination>(25);
    const [selectedSpot, setSelectedSpot] = useState<BetSpotId>("main");
    const [mainChips, setMainChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("paigow", "main")));
    const [fortuneChips, setFortuneChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("paigow", "fortune")));
    const [aceHighChips, setAceHighChips] = useState<ChipDenomination[]>(() => buildChipStackFromAmount(defaultBet("paigow", "aceHigh")));

    // Rebuild chip stacks whenever we return to betting (e.g. after Next Hand)
    useEffect(() => {
        if (stage === "betting") {
            setMainChips(buildChipStackFromAmount(mainBet));
            setFortuneChips(buildChipStackFromAmount(fortuneBet));
            setAceHighChips(buildChipStackFromAmount(aceHighBet));
            setSelectedSpot("main");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage]);

    // After a deal the dealer's cards turn over one at a time and are set into High / Low.
    // The player's cards stay face down until the player turns them (click a card, or Reveal).
    const [revealStep, setRevealStep] = useState(DEALER_SET);
    const [peeled, setPeeled] = useState<string[]>([]);
    const [playerSorted, setPlayerSorted] = useState(false);
    useLayoutEffect(() => {
        if (stage !== "setting") { setRevealStep(DEALER_SET); return; }
        setRevealStep(0);
        setPeeled([]);
        setPlayerSorted(false);
        const timers: number[] = [];
        let t = 350;
        for (let step = 1; step <= DEALER_SET; step++) {
            t += step === DEALER_SET ? 550 : 130;
            timers.push(window.setTimeout(() => setRevealStep(step), t));
        }
        return () => timers.forEach((id) => window.clearTimeout(id));
    }, [stage]);

    // Once every card is face up, give the last flip a moment and then sort the hand
    const allPeeled = playerCards.length === 7 && peeled.length === 7;
    useEffect(() => {
        if (stage !== "setting" || !allPeeled || playerSorted) return;
        const id = window.setTimeout(() => setPlayerSorted(true), 520);
        return () => window.clearTimeout(id);
    }, [stage, allPeeled, playerSorted]);
    const playerReady = stage === "showdown" || (stage === "setting" && playerSorted);

    const peelCard = (cardId: string) => {
        setPeeled((prev) => (prev.includes(cardId) ? prev : [...prev, cardId]));
    };
    const revealAll = () => {
        playerCards.filter((c) => !peeled.includes(c.id)).forEach((c, i) => {
            window.setTimeout(() => peelCard(c.id), i * 110);
        });
    };

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
        setMessage("The dealer set your best high and low hands against theirs.");
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
        setRoundReturned(0);
        setMessage(getHighPaiGowInfo(d).aceHigh
            ? "Dealer has Ace-high pai gow. Main bet pushes. Turn over your cards."
            : "Dealer sets first. Their hand is live on the table. Pick 2 cards for your low hand, or press Ask Dealer for Help.");
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
        if (dealerAceHighInfo?.aceHigh) {
            mainReturn += mainBet;
            lines.push("Dealer has Ace-high pai gow. Main bet pushes.");
        } else if (playerWinsBack && playerWinsFront) {
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
        setRoundReturned(mainReturn);
        setResultLines(lines);
        setStage("showdown");
        setMessage("Showdown complete.");
    }

    // Dealer Ace-high pushes the main bet, so there is nothing for the player to decide. The player
    // still turns their own cards over. Once all seven are up, the hand is set for them and ends.
    const autoFinishing = stage === "setting" && !!dealerAceHighInfo?.aceHigh;
    useEffect(() => {
        if (!autoFinishing || revealStep < DEALER_SET || !playerSorted) return;
        let id: number;
        if (selectedFrontIds.length !== 2) {
            // set the way the dealer would: nothing rides on it, so it should simply look right
            id = window.setTimeout(() => setSelectedFrontIds(evaluateDealerHouseWay(playerCards).front.map((c) => c.id)), 600);
        } else {
            id = window.setTimeout(setHandAndResolve, 900);
        }
        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoFinishing, revealStep, playerSorted, selectedFrontIds]);

    function handleChangeBet() {
        setPlayerCards([]);
        setDealerCards([]);
        setSelectedFrontIds([]);
        setWagerAtDeal(0);
        setResultLines([]);
        setNet(null);
        setRoundReturned(0);
        setStage("betting");
        setMessage("Adjust your wagers and press Deal.");
    }

    function handleClearAndReset() {
        setMainBet(MAIN_MIN);
        setFortuneBet(0);
        setAceHighBet(0);
        setPlayerCards([]);
        setDealerCards([]);
        setSelectedFrontIds([]);
        setWagerAtDeal(0);
        setResultLines([]);
        setNet(null);
        setRoundReturned(0);
        setStage("betting");
        setMessage("Set your wagers and press Deal.");
    }

    // ── UI chip handlers ──────────────────────────────────────────────────────
    const canBet = stage === "betting";

    const addChip = (spot: BetSpotId, chip: ChipDenomination) => {
        if (!canBet) return;
        if (spot === "main") { setMainBet((b) => b + chip); setMainChips((s) => [...s, chip]); }
        else if (spot === "fortune") { setFortuneBet((b) => b + chip); setFortuneChips((s) => [...s, chip]); }
        else { setAceHighBet((b) => b + chip); setAceHighChips((s) => [...s, chip]); }
    };

    const clearSpot = (spot: BetSpotId) => {
        if (!canBet) return;
        if (spot === "main") {
            setMainBet((b) => { const next = popLastChip(b, MAIN_MIN); setMainChips(buildChipStackFromAmount(next)); return next; });
        } else if (spot === "fortune") {
            setFortuneBet((b) => { const next = popLastChip(b, 0); setFortuneChips(buildChipStackFromAmount(next)); return next; });
        } else {
            setAceHighBet((b) => { const next = popLastChip(b, 0); setAceHighChips(buildChipStackFromAmount(next)); return next; });
        }
    };

    // Tray chip goes onto the highlighted spot
    const handleChipSelect = (chip: ChipDenomination) => {
        setSelectedChip(chip);
        if (canBet) addChip(selectedSpot, chip);
    };

    // Clicking a spot only highlights it
    const handleZoneClick = (spot: BetSpotId) => {
        if (!canBet) return;
        setSelectedSpot(spot);
    };

    const handleClear = () => {
        handleClearAndReset();
        setMainChips(buildChipStackFromAmount(MAIN_MIN));
        setFortuneChips([]);
        setAceHighChips([]);
        setSelectedSpot("main");
    };

    // ── Derived render values ─────────────────────────────────────────────────
    const dealerSetting = stage === "setting" && revealStep < DEALER_SET;
    const dealerIsSet = revealStep >= DEALER_SET && dealerBestSplit !== null;

    // Player stack: Low hand on top (nearer the dealer), the rest below
    // Every hand is shown by power: the cards that make the hand first, then the rest by rank
    const powerOrder = (cards: Card[], mode: SortMode = "auto") => sortByPower(
        cards.map((c) => ({ id: c.id, value: isJoker(c) ? 14 : valueOf(c), suit: c.suit, wild: isJoker(c) ? "semi" as const : undefined })),
        mode,
    );
    const modeFor = (category: string): SortMode =>
        category === "Flush" ? "flush"
        : category === "Straight" || category === "Straight Flush" || category === "Royal Flush" ? "straight"
        : "groups";
    const lowIds = playerReady ? powerOrder(playerCards.filter((c) => selectedFrontIds.includes(c.id)), "groups") : [];
    const dealerHighIds = dealerBestSplit ? powerOrder(dealerBestSplit.back, modeFor(dealerBestSplit.backEval.category)) : [];
    const dealerLowIds = dealerBestSplit ? powerOrder(dealerBestSplit.front, "groups") : [];
    // the player's remaining cards: as a set five-card hand once two are picked, otherwise all of them together
    const playerRest = playerCards.filter((c) => !lowIds.includes(c.id));
    const playerRestOrder = !playerReady ? playerRest.map((c) => c.id)
        : playerRest.length === 5 && currentBackEval ? powerOrder(playerRest, modeFor(currentBackEval.category))
        : powerOrder(playerRest);
    const playerRowCards = playerRestOrder.map((id) => playerRest.find((c) => c.id === id)!);
    const playerHasStartedSetting = selectedFrontIds.length > 0;

    const displayMessage =
        stage !== "setting" ? message
        : dealerSetting ? "Dealer is setting their hand..."
        : !playerReady || autoFinishing
            ? (dealerAceHighInfo?.aceHigh
                ? (playerReady ? "Dealer has Ace-high pai gow. Main bet pushes." : "Dealer has Ace-high pai gow. Main bet pushes. Turn over your cards.")
                : "Tap your cards to turn them over, or press Reveal Cards.")
        : message;

    const displayWager = stage === "betting"
        ? mainBet + (fortuneBet > 0 ? fortuneBet : 0) + (aceHighBet > 0 ? aceHighBet : 0)
        : wagerAtDeal;
    const canRebet = mainBet >= MAIN_MIN && bankroll >= (mainBet + fortuneBet + aceHighBet);

    const mainWon = stage === "showdown" && resultLines.some((l) => l.includes("wins both hands"));
    const fortuneWon = stage === "showdown" && fortuneBet > 0 && fortunePreview !== null && fortunePreview.multiplier > 0;
    const aceHighWon = stage === "showdown" && aceHighBet > 0 && !!(dealerAceHighInfo?.aceHigh);

    const fortuneHighlight =
        playerReady && fortunePreview && fortunePreview.category !== "No Fortune"
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
                        canRebet={canRebet}
                        dealerSetting={revealStep < DEALER_SET}
                        playerReady={playerReady}
                        autoFinishing={autoFinishing}
                        onRevealAll={revealAll}
                        onChipSelect={handleChipSelect}
                        onDeal={dealHand}
                        onAutoSetBest={autoSetBest}
                        onSetHand={setHandAndResolve}
                        onClear={handleClear}
                        onChangeBet={handleChangeBet}
                    />
                }
            >
                <TableLabel onRules={() => setShowRules(true)} />

                <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:overflow-hidden lg:px-6">

                    {/* ── LEFT: betting ──────────────────────────────────── */}
                    <div className={`${canBet ? "order-1" : "order-2"} flex w-full flex-col items-center justify-center gap-4 px-4 py-2 lg:order-1 lg:w-64 lg:shrink-0 lg:px-0`}>

                        <BetBar
                            compact
                            pendingBet={displayWager}
                            returned={roundReturned}
                            net={net ?? 0}
                            showResult={stage === "showdown"}
                        />

                        {/* Side bet circles */}
                        <div className="flex items-end gap-6">
                            <BetSpot
                                testId="fortune"
                                chips={fortuneChips} totalBet={fortuneBet}
                                label="Fortune" sublabel="optional"
                                dim={82}
                                isSelected={selectedSpot === "fortune"}
                                isWinner={fortuneWon}
                                canBet={canBet}
                                onSelect={() => handleZoneClick("fortune")}
                                onRemove={() => clearSpot("fortune")}
                            />
                            <BetSpot
                                testId="aceHigh"
                                chips={aceHighChips} totalBet={aceHighBet}
                                label="Ace High" sublabel="optional"
                                dim={82}
                                isSelected={selectedSpot === "aceHigh"}
                                isWinner={aceHighWon}
                                canBet={canBet}
                                onSelect={() => handleZoneClick("aceHigh")}
                                onRemove={() => clearSpot("aceHigh")}
                            />
                        </div>

                        {/* Main bet circle */}
                        <BetSpot
                            testId="main"
                            chips={mainChips} totalBet={mainBet}
                            label="Main" sublabel={`min $${MAIN_MIN}`}
                            dim={110}
                            isSelected={selectedSpot === "main"}
                            isWinner={mainWon}
                            canBet={canBet}
                            onSelect={() => handleZoneClick("main")}
                            onRemove={() => clearSpot("main")}
                        />

                        {/* Fortune preview during setting */}
                        {stage === "setting" && playerReady && fortunePreview && fortunePreview.category !== "No Fortune" && (
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
                                    <p
                                        key={i}
                                        className={`text-[11px] leading-snug ${
                                            i === 0
                                                ? (net ?? 0) > 0 ? "text-emerald-300" : (net ?? 0) < 0 ? "text-red-300" : "text-amber-100"
                                                : "text-white/90"
                                        }`}
                                    >
                                        {line}
                                    </p>
                                ))}
                            </motion.div>
                        )}
                    </div>

                    {/* ── CENTER: cards ───────────────────────────────────── */}
                    <div className={`${canBet ? "order-2" : "order-1"} flex w-full flex-col items-center gap-3 px-2 py-2 lg:order-2 lg:flex-1`}>

                        {/* Dealer: High hand in a row, Low hand pushed out in front toward the player */}
                        {dealerCards.length > 0 && (
                            <div className="flex w-full flex-col items-center gap-2">
                                <span className="text-[13px] font-bold text-white/75">Dealer</span>
                                <div
                                    className={`relative w-full max-w-[440px] ${STACK_VARS}`}
                                    style={{ height: `calc(var(--ch) * ${1 + DEALER_ROW_STEP})` }}
                                    data-testid="dealer-cards"
                                >
                                    {dealerCards.map((card, i) => {
                                        const lowCol = dealerIsSet ? dealerLowIds.indexOf(card.id) : -1;
                                        const highCol = dealerIsSet ? dealerHighIds.indexOf(card.id) : -1;
                                        const style = lowCol >= 0 ? slotStyle(1, lowCol, 2, DEALER_ROW_STEP, 20 + lowCol)
                                            : highCol >= 0 ? slotStyle(0, highCol, 5, DEALER_ROW_STEP, 10 + highCol)
                                            : slotStyle(0, i, 7, DEALER_ROW_STEP, 10 + i);
                                        return (
                                            <div key={card.id} style={style} data-hand={lowCol >= 0 ? "low" : highCol >= 0 ? "high" : "spread"}>
                                                <motion.div variants={CARD_VARIANTS} initial="initial" animate="animate" transition={CARD_TRANSITION(i * 0.04)}>
                                                    <PlayingCard card={toShared(card, dealerIsSet || i < revealStep)} className={CARD_SM} />
                                                </motion.div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="flex min-h-[16px] flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[11px]">
                                    {dealerIsSet && dealerBestSplit && (
                                        <>
                                            <span>
                                                <span className="font-bold text-white/75">High </span>
                                                <span className="font-semibold text-amber-100">{dealerBestSplit.backEval.label}</span>
                                            </span>
                                            <span className="text-white/75">·</span>
                                            <span>
                                                <span className="font-bold text-white/75">Low </span>
                                                <span className="font-semibold text-amber-100">{dealerBestSplit.frontEval.label}</span>
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Divider */}
                        {dealerCards.length > 0 && playerCards.length > 0 && (
                            <div className="h-px w-full max-w-md bg-white/8 shrink-0" />
                        )}

                        {/* Player: Low hand on top (nearer the dealer), the other cards below */}
                        {playerCards.length > 0 && (
                            <div className="flex w-full flex-col items-center gap-2">
                                <div
                                    className={`relative w-full max-w-[440px] ${STACK_VARS}`}
                                    style={{ height: `calc(var(--ch) * ${1 + PLAYER_ROW_STEP})` }}
                                    data-testid="player-cards"
                                >
                                    {/* Empty Low spots */}
                                    {[0, 1].map((col) => (
                                        <div
                                            key={`low-slot-${col}`}
                                            style={{ ...slotStyle(0, col, 2, PLAYER_ROW_STEP, 1), width: "var(--cw)", height: "var(--ch)" }}
                                            className="flex items-start justify-center rounded-[9px] border border-dashed border-white/20 bg-black/15 pt-1.5 sm:rounded-[11px]"
                                        >
                                            <span className="text-[13px] font-bold text-white/75">Low</span>
                                        </div>
                                    ))}

                                    {playerCards.map((card, i) => {
                                        const isPeeled = peeled.includes(card.id) || stage === "showdown";
                                        const lowCol = lowIds.indexOf(card.id);
                                        const rowCol = playerRowCards.findIndex((c) => c.id === card.id);
                                        const style = lowCol >= 0
                                            ? slotStyle(0, lowCol, 2, PLAYER_ROW_STEP, 10 + lowCol)
                                            : slotStyle(1, rowCol, playerRowCards.length, PLAYER_ROW_STEP, 20 + rowCol);
                                        const canClick = stage === "setting" && !dealerSetting && (!isPeeled || (playerReady && !autoFinishing));
                                        return (
                                            <div key={card.id} style={style} data-hand={lowCol >= 0 ? "low" : "high"}>
                                                <motion.button
                                                    onClick={() => (isPeeled ? toggleFront(card.id) : peelCard(card.id))}
                                                    disabled={!canClick}
                                                    aria-label={isPeeled ? (lowCol >= 0 ? "Move back to high hand" : "Move to low hand") : "Turn card over"}
                                                    variants={CARD_VARIANTS}
                                                    initial="initial"
                                                    animate="animate"
                                                    transition={CARD_TRANSITION(i * 0.04)}
                                                    whileTap={canClick ? { scale: 0.97 } : undefined}
                                                    className={`block rounded-[9px] transition-[translate] duration-150 sm:rounded-[11px] ${canClick ? "cursor-pointer hover:-translate-y-1" : "cursor-default"} ${
                                                        lowCol >= 0 && stage === "setting" ? "ring-2 ring-amber-400/80" : ""
                                                    }`}
                                                >
                                                    <PlayingCard card={toShared(card, isPeeled)} className={CARD_SM} />
                                                </motion.button>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Hand names: High then Low, the same order as the dealer */}
                                <div className="flex min-h-[16px] flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[11px]">
                                    {playerReady && (
                                        <>
                                            <span>
                                                <span className="font-bold text-white/75">High </span>
                                                <span className="font-semibold text-amber-100">{currentBackEval?.label ?? "-"}</span>
                                            </span>
                                            <span className="text-white/75">·</span>
                                            <span>
                                                <span className="font-bold text-white/75">Low </span>
                                                <span className="font-semibold text-amber-100">{currentFrontEval?.label ?? "pick 2 cards"}</span>
                                            </span>
                                        </>
                                    )}
                                </div>
                                <span className="text-[13px] font-bold text-white/75">Player</span>

                                {/* Illegal split warning */}
                                {playerHasStartedSetting && selectedFrontIds.length === 2 && !selectedIsLegal && (
                                    <p className="text-[11px] font-bold text-red-400">Illegal - high hand must beat low hand</p>
                                )}

                                {/* Outcome quality indicator */}
                                {stage === "setting" && selectedFrontIds.length === 2 && selectedIsLegal && (
                                    <div className="flex items-center gap-2 text-[11px]">
                                        <span className="font-bold text-emerald-400">Legal split</span>
                                        <span className="text-white/75">·</span>
                                        <span className={
                                            selectedIsExactBest ? "font-bold text-emerald-300"
                                            : selectedMatchesBestOutcome ? "font-bold text-amber-300"
                                            : "text-white/75"
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
                        <p className="text-center text-sm font-semibold text-amber-50" data-testid="message">{displayMessage}</p>
                    </div>

                    {/* ── RIGHT: payout tables ────────────────────────────── */}
                    <div className="order-3 hidden w-72 shrink-0 flex-col justify-center lg:flex">
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
